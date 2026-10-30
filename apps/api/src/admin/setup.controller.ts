// 첫 설정 (서버를 처음 켰을 때 한 번): 총관리자 계정 → 이메일 발송 계정 → 완료
// 관리자 입구(Tailscale)에서만 열리고, 완료한 뒤에는 모두 409로 막힌다.
//
// OTP는 2026-10-30 사용자 결정으로 없앴다. 관리자 화면은 Tailscale에 로그인한 기기에서만 열리므로
// "Tailscale 기기 + 아이디·비밀번호" 두 겹으로 지킨다. 기기를 잃어버리면 Tailscale 관리 콘솔에서 그 기기를 지운다.
import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { AuditService, clientIp } from '../common/audit.service';
import { AppError, Errors, parse } from '../common/errors';
import { KvService } from '../common/kv.service';
import { PrismaService } from '../common/prisma.service';
import { MailService, SETTING, SettingsService } from '../mail/mail.service';
import { Public, Roles, SessionService } from '../auth/session';

const accountInput = z.object({
  username: z.string().trim().regex(/^[a-zA-Z0-9_.-]{4,30}$/, '아이디는 영문·숫자 4~30자로 만들어 주세요.'),
  password: z.string().min(12, '비밀번호는 12자 이상이어야 해요.').max(100),
});
export const smtpInput = z.object({
  host: z.string().trim().min(1, 'SMTP 서버를 입력해 주세요.').max(200),
  port: z.coerce.number().int().min(1).max(65535),
  secure: z.boolean().default(false),
  user: z.string().trim().min(1, '계정을 입력해 주세요.').max(200),
  password: z.string().max(200).default(''),
  fromName: z.string().trim().min(1, '보내는 사람 이름을 입력해 주세요.').max(100),
  testTo: z.string().trim().email('테스트 메일 받을 주소를 확인해 주세요.'),
});
const loginInput = z.object({
  username: z.string().trim().min(1, '아이디를 입력해 주세요.').max(30),
  password: z.string().min(1, '비밀번호를 입력해 주세요.').max(100),
});

@Controller('admin')
export class SetupController {
  constructor(
    private prisma: PrismaService,
    private settings: SettingsService,
    private mail: MailService,
    private sessions: SessionService,
    private kv: KvService,
    private audit: AuditService,
  ) {}

  private async completed() {
    return !!(await this.settings.get(SETTING.setupCompletedAt));
  }
  private async assertNotCompleted() {
    if (await this.completed()) throw Errors.conflict('SETUP_DONE', '첫 설정은 이미 끝났어요.');
  }

  @Public()
  @Get('setup/status')
  async status() {
    if (await this.completed()) return { completed: true, step: 'done' };
    const admin = await this.prisma.admin.findFirst();
    if (!admin) return { completed: false, step: 'account' };
    if (!(await this.settings.getSmtp())) return { completed: false, step: 'smtp' };
    return { completed: false, step: 'done' };
  }

  /** 1단계: 총관리자 계정 만들기. 첫 설정을 끝내기 전이면 다시 만들 수 있다 (비밀번호를 잊은 경우 등) */
  @Public()
  @Post('setup/account')
  @HttpCode(204)
  async account(@Body() body: unknown) {
    await this.assertNotCompleted();
    const b = parse(accountInput, body);
    const passwordHash = await bcrypt.hash(b.password, 12);
    const existing = await this.prisma.admin.findFirst();
    if (existing) await this.prisma.admin.update({ where: { id: existing.id }, data: { username: b.username, passwordHash } });
    else await this.prisma.admin.create({ data: { username: b.username, passwordHash } });
  }

  /** 2단계: 이메일 발송 계정. 테스트 메일이 가야 저장된다 */
  @Public()
  @Post('setup/smtp')
  @HttpCode(204)
  async smtp(@Body() body: unknown) {
    await this.assertNotCompleted();
    const admin = await this.prisma.admin.findFirst();
    if (!admin) throw Errors.conflict('NO_ADMIN', '먼저 총관리자 계정을 만들어 주세요.');
    const b = parse(smtpInput, body);
    if (!b.password) throw Errors.validation('앱 비밀번호를 입력해 주세요.');
    const smtp = { host: b.host, port: b.port, secure: b.secure, user: b.user, password: b.password, fromName: b.fromName };
    await this.mail.testSmtp(smtp, b.testTo);
    await this.settings.saveSmtp(smtp, admin.id);
    await this.settings.set(SETTING.adminEmail, b.testTo, { adminId: admin.id });
  }

  @Public()
  @Post('setup/complete')
  @HttpCode(204)
  async complete() {
    await this.assertNotCompleted();
    const admin = await this.prisma.admin.findFirst();
    if (!admin || !(await this.settings.getSmtp())) throw Errors.conflict('SETUP_INCOMPLETE', '앞 단계를 먼저 끝내 주세요.');
    await this.settings.set(SETTING.setupCompletedAt, new Date().toISOString(), { adminId: admin.id });
  }

  /** 총관리자 로그인: 아이디 + 비밀번호 (Tailscale 기기에서만 열림). 로그아웃할 때까지 그 기기에서 유지 */
  @Public()
  @Post('auth/login')
  async login(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    if (!(await this.completed())) throw new AppError(409, 'SETUP_REQUIRED', '첫 설정을 먼저 끝내 주세요.');
    const b = parse(loginInput, body);
    if (!(await this.kv.allow(`admin-login:${b.username}`, 10, 300)) || !(await this.kv.allow(`admin-login-ip:${clientIp(req)}`, 30, 300))) throw Errors.tooMany();
    const admin = await this.prisma.admin.findUnique({ where: { username: b.username } });
    const ok = admin && admin.isActive && (await bcrypt.compare(b.password, admin.passwordHash));
    if (!ok) {
      await this.audit.record({ type: 'admin', id: admin?.id }, 'login_failed', undefined, { username: b.username }, req);
      throw new AppError(401, 'LOGIN_FAILED', '아이디 또는 비밀번호가 맞지 않아요.');
    }
    await this.prisma.admin.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } });
    await this.sessions.create(res, { role: 'admin', id: admin.id });
    return { role: 'admin', admin: { id: admin.id, username: admin.username } };
  }

  // ---------- 설정 화면 (A-12) ----------
  @Roles('admin')
  @Get('settings/smtp')
  async getSmtp() {
    const s = await this.settings.getSmtp();
    return { host: s?.host ?? '', port: s?.port ?? 587, secure: s?.secure ?? false, user: s?.user ?? '', fromName: s?.fromName ?? '', passwordSet: !!s?.password };
  }
}
