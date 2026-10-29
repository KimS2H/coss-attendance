// 첫 설정 (서버를 처음 켰을 때 한 번): 총관리자 계정 → OTP 등록 → 이메일 발송 계정 → 완료
// 관리자 입구(Tailscale)에서만 열리고, 완료한 뒤에는 모두 409로 막힌다.
import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import type { Request, Response } from 'express';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { z } from 'zod';
import { AuditService, clientIp } from '../common/audit.service';
import { decrypt, encrypt } from '../common/crypto';
import { AppError, Errors, parse } from '../common/errors';
import { KvService } from '../common/kv.service';
import { PrismaService } from '../common/prisma.service';
import { MailService, SETTING, SettingsService } from '../mail/mail.service';
import { Public, Roles, SessionService } from '../auth/session';

const accountInput = z.object({
  username: z.string().trim().regex(/^[a-zA-Z0-9_.-]{4,30}$/, '아이디는 영문·숫자 4~30자로 만들어 주세요.'),
  password: z.string().min(12, '비밀번호는 12자 이상이어야 해요.').max(100),
});
const otpInput = z.object({ otp: z.string().regex(/^\d{6}$/, 'OTP 6자리 숫자를 입력해 주세요.') });
export const smtpInput = z.object({
  host: z.string().trim().min(1, 'SMTP 서버를 입력해 주세요.').max(200),
  port: z.coerce.number().int().min(1).max(65535),
  secure: z.boolean().default(false),
  user: z.string().trim().min(1, '계정을 입력해 주세요.').max(200),
  password: z.string().max(200).default(''),
  fromName: z.string().trim().min(1, '보내는 사람 이름을 입력해 주세요.').max(100),
  testTo: z.string().trim().email('테스트 메일 받을 주소를 확인해 주세요.'),
});
const loginInput = z.object({ username: z.string().trim().min(1).max(30), password: z.string().min(1).max(100), otp: z.string().regex(/^\d{6}$/, 'OTP 6자리 숫자를 입력해 주세요.') });

const ISSUER = 'IoT 혁신융합대학 출석체크';

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
    if (!admin.otpVerified) return { completed: false, step: 'otp' };
    if (!(await this.settings.getSmtp())) return { completed: false, step: 'smtp' };
    return { completed: false, step: 'done' };
  }

  /** 1단계: 총관리자 계정 만들기 → OTP 등록용 QR */
  @Public()
  @Post('setup/account')
  async account(@Body() body: unknown) {
    await this.assertNotCompleted();
    const b = parse(accountInput, body);
    const existing = await this.prisma.admin.findFirst();
    if (existing?.otpVerified) throw Errors.conflict('ADMIN_EXISTS', '총관리자 계정이 이미 있어요. 다음 단계로 진행해 주세요.');
    if (existing) await this.prisma.admin.delete({ where: { id: existing.id } }); // OTP 확인 전이면 다시 만들 수 있다
    const secret = authenticator.generateSecret();
    await this.prisma.admin.create({ data: { username: b.username, passwordHash: await bcrypt.hash(b.password, 12), otpSecretEnc: encrypt(secret) } });
    const otpauthUrl = authenticator.keyuri(b.username, ISSUER, secret);
    return { otpauthUrl, qrDataUrl: await QRCode.toDataURL(otpauthUrl, { width: 240, margin: 1 }) };
  }

  /** 2단계: OTP 앱에 등록했는지 6자리로 확인 */
  @Public()
  @Post('setup/otp')
  @HttpCode(204)
  async otp(@Body() body: unknown) {
    await this.assertNotCompleted();
    const b = parse(otpInput, body);
    const admin = await this.prisma.admin.findFirst();
    if (!admin) throw Errors.conflict('NO_ADMIN', '먼저 총관리자 계정을 만들어 주세요.');
    if (!authenticator.check(b.otp, decrypt(admin.otpSecretEnc))) throw Errors.validation('OTP 숫자가 맞지 않아요. 앱에 보이는 최신 숫자를 입력해 주세요.');
    await this.prisma.admin.update({ where: { id: admin.id }, data: { otpVerified: true } });
  }

  /** 3단계: 이메일 발송 계정. 테스트 메일이 가야 저장된다 */
  @Public()
  @Post('setup/smtp')
  @HttpCode(204)
  async smtp(@Body() body: unknown) {
    await this.assertNotCompleted();
    const admin = await this.prisma.admin.findFirst();
    if (!admin?.otpVerified) throw Errors.conflict('NO_ADMIN', '먼저 총관리자 계정과 OTP를 등록해 주세요.');
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
    if (!admin?.otpVerified || !(await this.settings.getSmtp())) throw Errors.conflict('SETUP_INCOMPLETE', '앞 단계를 먼저 끝내 주세요.');
    await this.settings.set(SETTING.setupCompletedAt, new Date().toISOString(), { adminId: admin.id });
  }

  /** 총관리자 로그인: 아이디 + 비밀번호 + OTP */
  @Public()
  @Post('auth/login')
  async login(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    if (!(await this.completed())) throw new AppError(409, 'SETUP_REQUIRED', '첫 설정을 먼저 끝내 주세요.');
    const b = parse(loginInput, body);
    if (!(await this.kv.allow(`admin-login:${b.username}`, 10, 300)) || !(await this.kv.allow(`admin-login-ip:${clientIp(req)}`, 30, 300))) throw Errors.tooMany();
    const admin = await this.prisma.admin.findUnique({ where: { username: b.username } });
    const ok = admin && admin.isActive && (await bcrypt.compare(b.password, admin.passwordHash)) && authenticator.check(b.otp, decrypt(admin.otpSecretEnc));
    if (!ok) {
      await this.audit.record({ type: 'admin', id: admin?.id }, 'login_failed', undefined, { username: b.username }, req);
      throw new AppError(401, 'LOGIN_FAILED', '아이디, 비밀번호 또는 OTP가 맞지 않아요.');
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
