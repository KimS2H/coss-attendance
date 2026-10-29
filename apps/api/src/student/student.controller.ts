// 학생 API: 동의, 오늘 수업, 출석하기, 문의
import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { AttendanceService } from '../attendance/attendance.service';
import { TicketsService } from '../attendance/tickets.service';
import { hashDevice } from '../common/crypto';
import { Errors, parse } from '../common/errors';
import { KvService } from '../common/kv.service';
import { DEVICE_COOKIE } from '../common/middleware';
import { PrismaService } from '../common/prisma.service';
import { CONSENT_VERSION } from '../auth/me.service';
import { Auth, AuthSession, Roles } from '../auth/session';

const consentBody = z.object({
  privacy: z.literal(true, { errorMap: () => ({ message: '개인정보 수집·이용 동의가 필요해요.' }) }),
  location: z.boolean(),
  version: z.string().max(40).optional(),
});
const attendBody = z.object({
  sessionId: z.coerce.number().int().positive(),
  code: z.string().trim().max(10),
  location: z
    .object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), accuracy: z.number().min(0).max(100000) })
    .nullable(),
});
export const STUDENT_CATEGORIES = ['출석 불가', '위치 인식 불가', '코드 입력 불가', '로그인 불가', '기기 변경·분실', '수업 정보 오류', '기타'];
const ticketBody = z.object({
  category: z.string().refine((c) => STUDENT_CATEGORIES.includes(c), '문의 분류를 골라 주세요.'),
  sessionId: z.coerce.number().int().positive().nullable().optional(),
  content: z.string().trim().min(1, '내용을 적어 주세요.').max(2000),
  diagnostics: z.record(z.unknown()).optional(),
});

@Roles('student')
@Controller('student')
export class StudentController {
  constructor(
    private prisma: PrismaService,
    private attendance: AttendanceService,
    private tickets: TicketsService,
    private kv: KvService,
  ) {}

  @Post('consents')
  @HttpCode(204)
  async consents(@Body() body: unknown, @Auth() s: AuthSession) {
    const b = parse(consentBody, body);
    const data = [{ studentId: s.id, consentType: 'privacy', version: CONSENT_VERSION }];
    if (b.location) data.push({ studentId: s.id, consentType: 'location', version: CONSENT_VERSION });
    await this.prisma.consent.createMany({ data });
  }

  @Get('today')
  today(@Auth() s: AuthSession) {
    return this.attendance.today(s.id);
  }

  @Post('attendance')
  async attend(@Body() body: unknown, @Auth() s: AuthSession, @Req() req: Request) {
    const b = parse(attendBody, body);
    if (!(await this.kv.allow(`attend:${s.id}`, 10, 60))) throw Errors.tooMany();
    const fp = hashDevice(req.cookies[DEVICE_COOKIE]);
    return this.attendance.attend(s.id, fp, String(req.headers['user-agent'] ?? '').slice(0, 300), b);
  }

  @Get('tickets')
  myTickets(@Auth() s: AuthSession) {
    return this.tickets.listForStudent(s.id);
  }

  @Post('tickets')
  async newTicket(@Body() body: unknown, @Auth() s: AuthSession) {
    const b = parse(ticketBody, body);
    if (!(await this.kv.allow(`ticket:${s.id}`, 10, 3600))) throw Errors.tooMany();
    return this.tickets.createByStudent(s.id, { ...b, sessionId: b.sessionId ?? null });
  }
}
