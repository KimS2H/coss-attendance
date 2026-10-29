// 이메일 발송과 알림 기록.
// 발송 계정(SMTP)은 코드에 없다. 총관리자가 첫 설정 화면에서 넣은 값을 DB(app_settings)에서 읽는다.
import { Injectable, Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { decrypt, encrypt } from '../common/crypto';
import { Errors } from '../common/errors';
import { PrismaService } from '../common/prisma.service';

export type Smtp = { host: string; port: number; secure: boolean; user: string; password: string; fromName: string };

export const SETTING = {
  host: 'smtp.host',
  port: 'smtp.port',
  secure: 'smtp.secure',
  user: 'smtp.user',
  password: 'smtp.password',
  fromName: 'smtp.from_name',
  adminEmail: 'notify.admin_email', // 총관리자 알림을 받을 주소 (첫 설정의 테스트 메일 주소)
  setupCompletedAt: 'setup.completed_at',
} as const;

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

  async get(key: string): Promise<string | null> {
    const row = await this.prisma.appSetting.findUnique({ where: { key } });
    if (!row) return null;
    return row.isSecret ? decrypt(row.value) : row.value;
  }

  async set(key: string, value: string, opts: { secret?: boolean; adminId?: number | null } = {}) {
    const stored = opts.secret ? encrypt(value) : value;
    await this.prisma.appSetting.upsert({
      where: { key },
      create: { key, value: stored, isSecret: !!opts.secret, updatedBy: opts.adminId ?? null },
      update: { value: stored, isSecret: !!opts.secret, updatedBy: opts.adminId ?? null },
    });
  }

  async getSmtp(): Promise<Smtp | null> {
    const [host, port, secure, user, password, fromName] = await Promise.all(
      [SETTING.host, SETTING.port, SETTING.secure, SETTING.user, SETTING.password, SETTING.fromName].map((k) => this.get(k)),
    );
    if (!host || !user || !password) return null;
    return { host, port: Number(port ?? 587), secure: secure === 'true', user, password, fromName: fromName ?? '출석체크' };
  }

  async saveSmtp(s: Smtp, adminId: number | null) {
    await this.set(SETTING.host, s.host, { adminId });
    await this.set(SETTING.port, String(s.port), { adminId });
    await this.set(SETTING.secure, String(s.secure), { adminId });
    await this.set(SETTING.user, s.user, { adminId });
    await this.set(SETTING.password, s.password, { secret: true, adminId });
    await this.set(SETTING.fromName, s.fromName, { adminId });
  }
}

@Injectable()
export class MailService {
  private log = new Logger('Mail');
  constructor(
    private prisma: PrismaService,
    private settings: SettingsService,
  ) {}

  /** 바로 보내기. 실패하면 오류를 던진다 */
  async sendWith(smtp: Smtp, to: string, subject: string, text: string) {
    const transport = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: { user: smtp.user, pass: smtp.password },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
    });
    await transport.sendMail({ from: `"${smtp.fromName}" <${smtp.user}>`, to, subject, text });
  }

  /** 설정 저장 전 테스트 메일. 실패하면 화면에 보여 줄 400 오류 */
  async testSmtp(smtp: Smtp, to: string) {
    try {
      await this.sendWith(smtp, to, '[출석체크] 테스트 메일', '이메일 설정이 잘 되었어요. 이 메일은 답장하지 않아도 됩니다.');
    } catch (e) {
      throw Errors.validation(`테스트 메일을 보내지 못했어요. 서버·포트·계정·앱 비밀번호를 확인해 주세요. (${(e as Error).message.slice(0, 120)})`);
    }
  }

  // ---------- 알림 ----------

  /** 담당 학교 인솔자 전원에게 화면 알림 + 이메일 */
  async notifySchoolStaff(schoolId: number, kind: string, title: string, body: string) {
    const staff = await this.prisma.staff.findMany({ where: { schoolId, isActive: true } });
    for (const s of staff) await this.queue({ recipientType: 'staff', recipientId: s.id, email: s.email, kind, title, body });
  }

  async notifyStaff(staffId: number, kind: string, title: string, body: string) {
    const s = await this.prisma.staff.findUnique({ where: { id: staffId } });
    if (s) await this.queue({ recipientType: 'staff', recipientId: s.id, email: s.email, kind, title, body });
  }

  /** 총관리자에게 화면 알림 + 이메일 (첫 설정에서 정한 주소) */
  async notifyAdmins(kind: string, title: string, body: string) {
    const email = await this.settings.get(SETTING.adminEmail);
    await this.queue({ recipientType: 'admin', recipientId: null, email, kind, title, body });
  }

  private async queue(n: { recipientType: string; recipientId: number | null; email: string | null; kind: string; title: string; body: string }) {
    await this.prisma.notification.create({
      data: { recipientType: n.recipientType, recipientId: n.recipientId, channel: 'in_app', kind: n.kind, title: n.title, body: n.body },
    });
    if (n.email) {
      await this.prisma.notification.create({
        data: {
          recipientType: n.recipientType,
          recipientId: n.recipientId,
          recipientEmail: n.email,
          channel: 'email',
          kind: n.kind,
          title: n.title,
          body: n.body,
          sendStatus: 'pending',
        },
      });
      // 응답을 기다리게 하지 않고 뒤에서 보낸다. 실패분은 Worker가 1분마다 다시 보낸다.
      void this.flush().catch((e) => this.log.warn(`이메일 발송 실패: ${String(e)}`));
    }
  }

  private flushing = false;

  /** 보내지 못한 이메일 보내기 (최대 3번 시도) */
  async flush(): Promise<number> {
    if (this.flushing) return 0;
    this.flushing = true;
    let sent = 0;
    try {
      const smtp = await this.settings.getSmtp();
      if (!smtp) return 0; // 아직 첫 설정 전
      const list = await this.prisma.notification.findMany({
        where: { channel: 'email', sendStatus: { in: ['pending', 'failed'] }, sendAttempts: { lt: 3 } },
        orderBy: { id: 'asc' },
        take: 20,
      });
      for (const n of list) {
        try {
          await this.sendWith(smtp, n.recipientEmail!, `[출석체크] ${n.title}`, n.body);
          await this.prisma.notification.update({ where: { id: n.id }, data: { sendStatus: 'sent', sendAttempts: { increment: 1 } } });
          sent++;
        } catch (e) {
          this.log.warn(`이메일 실패 #${n.id}: ${(e as Error).message}`);
          await this.prisma.notification.update({ where: { id: n.id }, data: { sendStatus: 'failed', sendAttempts: { increment: 1 } } });
        }
      }
    } finally {
      this.flushing = false;
    }
    return sent;
  }
}
