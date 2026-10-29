// 로그인 API: 학생(학교·학번·이름) / 인솔자(학교·직번·이름 → 학교 코드) / 로그아웃 / 내 정보
import { Body, Controller, HttpCode, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { AttendanceService } from '../attendance/attendance.service';
import { AuditService, clientIp } from '../common/audit.service';
import { hashDevice, hashSchoolCode, safeEqual } from '../common/crypto';
import { AppError, Errors, parse } from '../common/errors';
import { KvService } from '../common/kv.service';
import { DEVICE_COOKIE } from '../common/middleware';
import { PrismaService } from '../common/prisma.service';
import { MeService } from './me.service';
import { Auth, AuthSession, Public, Roles, SessionService } from './session';

const MAX_CODE_FAILURES = 5;

const studentLogin = z.object({
  schoolId: z.coerce.number().int().positive('학교를 선택해 주세요.'),
  studentNo: z.string().trim().min(1, '학번을 입력해 주세요.').max(30),
  name: z.string().trim().min(1, '이름을 입력해 주세요.').max(30),
});
const staffLogin = z.object({
  schoolId: z.coerce.number().int().positive('학교를 선택해 주세요.'),
  staffNo: z.string().trim().min(1, '직번을 입력해 주세요.').max(30),
  name: z.string().trim().min(1, '이름을 입력해 주세요.').max(30),
});
const verify = z.object({ schoolCode: z.string().regex(/^\d{4}$/, '학교 코드 4자리 숫자를 입력해 주세요.') });

const loginFailed = () => new AppError(401, 'LOGIN_FAILED', '등록된 정보와 달라요. 학교·번호·이름을 다시 확인해 주세요.');

@Controller('auth')
export class AuthController {
  constructor(
    private prisma: PrismaService,
    private sessions: SessionService,
    private kv: KvService,
    private audit: AuditService,
    private attendance: AttendanceService,
    private me: MeService,
  ) {}

  @Public()
  @Post('student/login')
  async studentLogin(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const b = parse(studentLogin, body);
    await this.limit(`login:s:${b.schoolId}:${b.studentNo}`, req);
    const student = await this.prisma.student.findUnique({ where: { schoolId_studentNo: { schoolId: b.schoolId, studentNo: b.studentNo } } });
    if (!student || !student.isActive || student.name !== b.name) {
      await this.audit.record({ type: 'student', id: student?.id }, 'login_failed', undefined, { schoolId: b.schoolId, studentNo: b.studentNo }, req);
      throw loginFailed();
    }
    const fp = hashDevice(req.cookies[DEVICE_COOKIE]);
    const device = await this.attendance.checkDeviceOnLogin(student.id, fp, String(req.headers['user-agent'] ?? '').slice(0, 300));
    await this.sessions.create(res, { role: 'student', id: student.id, schoolId: student.schoolId });
    return { ...(await this.me.student(student.id)), device };
  }

  @Public()
  @Post('staff/login')
  async staffLogin(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const b = parse(staffLogin, body);
    await this.limit(`login:t:${b.schoolId}:${b.staffNo}`, req);
    const staff = await this.prisma.staff.findUnique({ where: { schoolId_staffNo: { schoolId: b.schoolId, staffNo: b.staffNo } } });
    if (!staff || !staff.isActive || staff.name !== b.name) {
      await this.audit.record({ type: 'staff', id: staff?.id }, 'login_failed', undefined, { schoolId: b.schoolId, staffNo: b.staffNo }, req);
      throw loginFailed();
    }
    await this.sessions.create(res, { role: 'staff_pending', id: staff.id, schoolId: staff.schoolId });
    return { next: 'school_code' };
  }

  @Roles('staff_pending')
  @Post('staff/verify')
  async staffVerify(@Body() body: unknown, @Auth() s: AuthSession, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const b = parse(verify, body);
    const school = await this.prisma.school.findUniqueOrThrow({ where: { id: s.schoolId! } });
    if (!school.codeHash || !safeEqual(hashSchoolCode(b.schoolCode), school.codeHash)) {
      const failures = (s.codeFailures ?? 0) + 1;
      await this.audit.record({ type: 'staff', id: s.id }, 'school_code_failed', { type: 'school', id: school.id }, { failures }, req);
      if (failures >= MAX_CODE_FAILURES) {
        await this.sessions.destroy(req, res);
        throw new AppError(401, 'UNAUTHORIZED', '학교 코드를 5번 틀렸어요. 처음부터 다시 로그인해 주세요.');
      }
      await this.sessions.update(req, { ...s, codeFailures: failures });
      throw new AppError(401, 'SCHOOL_CODE_FAILED', `학교 코드가 맞지 않아요. (${failures}/${MAX_CODE_FAILURES})`);
    }
    // 2차 인증 통과 → 새 세션(3시간)으로 바꾼다
    await this.sessions.destroy(req, res);
    await this.sessions.create(res, { role: 'staff', id: s.id, schoolId: s.schoolId });
    return this.me.staff(s.id);
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.sessions.destroy(req, res);
  }

  // ---------- 도우미 ----------
  private async limit(key: string, req: Request) {
    const okAccount = await this.kv.allow(key, 10, 300);
    const okIp = await this.kv.allow(`login-ip:${clientIp(req)}`, 120, 300); // 학교 Wi-Fi는 IP를 같이 써서 넉넉하게
    if (!okAccount || !okIp) throw Errors.tooMany();
  }
}
