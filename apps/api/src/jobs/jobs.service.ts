// ─────────────────────────────────────────────
// Worker가 정해진 시각에 하는 일 (API 서버와 따로 실행: npm run start:worker)
//  - 1분마다: 출결 변경 10분 초과 → 우선 거절 / 끝난 수업 미출 → 결석 / 이메일 재발송 / 상태 점검
//  - 매일 03:00: DB 백업 (7일 보관)
// ─────────────────────────────────────────────
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { execFile } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { statfs } from 'node:fs/promises';
import path from 'node:path';
import { createGzip } from 'node:zlib';
import { ChangeRequestsService } from '../attendance/change-requests.service';
import { sessionWindow } from '../attendance/rules';
import { KvService } from '../common/kv.service';
import { PrismaService } from '../common/prisma.service';
import { dateOnly, kstToday, toDbDate } from '../common/time';
import { config } from '../config';
import { MailService } from '../mail/mail.service';

const BACKUP_KEEP_DAYS = 7;
const DISK_WARN_PERCENT = 85;

@Injectable()
export class JobsService {
  private log = new Logger('Jobs');
  constructor(
    private prisma: PrismaService,
    private kv: KvService,
    private changes: ChangeRequestsService,
    private mail: MailService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async everyMinute() {
    await this.safe('출결 변경 우선 거절', () => this.changes.autoRejectExpired());
    await this.safe('자동 결석', () => this.markAbsent());
    await this.safe('이메일 재발송', () => this.mail.flush());
    await this.safe('상태 점검', () => this.healthCheck());
  }

  @Cron('0 0 3 * * *', { timeZone: 'Asia/Seoul' })
  async daily() {
    await this.safe('DB 백업', () => this.backup());
  }

  private async safe(name: string, fn: () => Promise<unknown>) {
    try {
      await fn();
    } catch (e) {
      this.log.error(`${name} 실패: ${(e as Error).message}`);
    }
  }

  /** 끝난 수업(오늘·어제)에서 출석 기록이 없는 수강생을 결석으로 */
  async markAbsent(now = new Date()) {
    const today = kstToday(now);
    const yesterday = kstToday(new Date(now.getTime() - 86400000));
    const sessions = await this.prisma.session.findMany({ where: { classDate: { in: [toDbDate(today), toDbDate(yesterday)] } } });
    let created = 0;
    for (const s of sessions) {
      const w = sessionWindow(dateOnly(s.classDate), s.startTime, s.endTime);
      if (now < w.end) continue;
      const missing = await this.prisma.enrollment.findMany({
        where: { sessionId: s.id, student: { attendances: { none: { sessionId: s.id } } } },
        select: { studentId: true },
      });
      if (missing.length === 0) continue;
      const r = await this.prisma.attendance.createMany({
        data: missing.map((m) => ({ studentId: m.studentId, sessionId: s.id, status: 'absent', decidedAt: w.end })),
        skipDuplicates: true,
      });
      created += r.count;
    }
    return created;
  }

  /** 상태 점검: 문제가 새로 생기면 incidents에 남기고 총관리자에게 이메일, 나아지면 해결 처리 */
  async healthCheck() {
    const checks: { component: string; ok: boolean; severity: 'warning' | 'critical'; message: string }[] = [];
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.push({ component: 'db', ok: true, severity: 'critical', message: '' });
    } catch (e) {
      checks.push({ component: 'db', ok: false, severity: 'critical', message: `DB 연결 실패: ${(e as Error).message}` });
    }
    const redisOk = await this.kv.ping();
    checks.push({ component: 'redis', ok: redisOk, severity: 'critical', message: 'Redis 연결 실패 (로그인이 안 될 수 있어요)' });
    try {
      const dir = existsSync(config().BACKUP_DIR) ? config().BACKUP_DIR : '/';
      const st = await statfs(dir);
      const used = Math.round((1 - st.bavail / st.blocks) * 100);
      checks.push({ component: 'disk', ok: used < DISK_WARN_PERCENT, severity: 'warning', message: `디스크 사용량 ${used}%` });
    } catch {
      // 디스크 정보를 못 읽는 환경이면 건너뛴다
    }
    const lastBackup = await this.prisma.backup.findFirst({ where: { status: 'success' }, orderBy: { id: 'desc' } });
    const hasAnyBackup = (await this.prisma.backup.count()) > 0;
    if (hasAnyBackup) {
      const fresh = !!lastBackup && Date.now() - lastBackup.createdAt.getTime() < 26 * 3600 * 1000;
      checks.push({ component: 'backup', ok: fresh, severity: 'warning', message: '최근 26시간 안에 성공한 백업이 없어요' });
    }

    for (const c of checks) {
      const open = await this.prisma.incident.findFirst({ where: { component: c.component, resolvedAt: null } });
      if (!c.ok && !open) {
        await this.prisma.incident.create({ data: { component: c.component, severity: c.severity, message: c.message, notifiedAt: new Date() } });
        await this.mail.notifyAdmins('incident', `[${c.severity === 'critical' ? '장애' : '경고'}] ${c.component}`, `${c.message}\n총관리자 화면의 "장애 현황"에서 확인해 주세요.`);
      } else if (c.ok && open) {
        await this.prisma.incident.update({ where: { id: open.id }, data: { resolvedAt: new Date() } });
      }
    }
  }

  /** pg_dump로 DB를 백업해 BACKUP_DIR에 저장 (.sql.gz), 7일 지난 파일은 지운다 */
  async backup() {
    const dir = config().BACKUP_DIR;
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const fileName = `coss-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.sql.gz`;
    const full = path.join(dir, fileName);
    try {
      await new Promise<void>((resolve, reject) => {
        const child = execFile('pg_dump', ['--no-owner', '--no-privileges', config().DATABASE_URL], { maxBuffer: 1024 * 1024 * 1024 });
        const out = createWriteStream(full);
        child.stdout!.pipe(createGzip()).pipe(out);
        let err = '';
        child.stderr!.on('data', (d) => (err += d));
        child.on('error', reject);
        out.on('finish', () => (child.exitCode && child.exitCode !== 0 ? reject(new Error(err)) : resolve()));
        child.on('exit', (code) => code !== 0 && reject(new Error(err || `pg_dump 종료 코드 ${code}`)));
      });
      await this.prisma.backup.create({ data: { fileName, sizeBytes: statSync(full).size, storage: 'local', status: 'success' } });
    } catch (e) {
      await this.prisma.backup.create({ data: { fileName, storage: 'local', status: 'failed' } });
      await this.mail.notifyAdmins('incident', '[경고] DB 백업 실패', (e as Error).message.slice(0, 500));
      throw e;
    }
    for (const f of readdirSync(dir)) {
      const p = path.join(dir, f);
      if (f.startsWith('coss-') && Date.now() - statSync(p).mtimeMs > BACKUP_KEEP_DAYS * 86400000) unlinkSync(p);
    }
  }
}
