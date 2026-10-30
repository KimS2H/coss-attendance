// 인솔자 API. 모든 기능이 담당 학교(세션의 schoolId) 데이터로만 제한된다.
// 권한이 "보기"인 인솔자는 조회만 할 수 있다 (requireEdit).
import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { z } from 'zod';
import { AttendanceService } from '../attendance/attendance.service';
import { ChangeRequestsService } from '../attendance/change-requests.service';
import { ListingService } from '../attendance/listing.service';
import { TicketsService } from '../attendance/tickets.service';
import { AuditService } from '../common/audit.service';
import { Errors, parse } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { isDateStr, kstToday } from '../common/time';
import { Auth, AuthSession, Roles } from '../auth/session';
import { ImportService } from '../excel/import.service';

export const studentInput = z.object({
  studentNo: z.string().trim().min(1, '학번을 입력해 주세요.').max(30),
  name: z.string().trim().min(1, '이름을 입력해 주세요.').max(30),
  college: z.string().trim().min(1, '단과대를 입력해 주세요.').max(50),
  department: z.string().trim().min(1, '학과를 입력해 주세요.').max(50),
  isActive: z.boolean().optional(),
});
const changeInput = z.object({
  studentId: z.coerce.number().int().positive(),
  sessionId: z.coerce.number().int().positive(),
  toStatus: z.enum(['present', 'late', 'absent', 'excused'], { errorMap: () => ({ message: '바꿀 상태를 골라 주세요.' }) }),
  reason: z.string().trim().min(1, '사유를 적어 주세요.').max(500),
  ticketId: z.coerce.number().int().positive().nullable().optional(),
});
const reasonInput = z.object({ reason: z.string().trim().min(1, '사유를 적어 주세요.').max(500) });
const messageInput = z.object({ body: z.string().trim().min(1, '내용을 적어 주세요.').max(2000) });
const modeInput = z.object({ mode: z.enum(['update', 'skip']).default('update') });
export const STAFF_CATEGORIES = ['정보 변경 불가', '학생 인식 불가', '엑셀 등록 오류', '강의실 코드 표시 오류', '출석 현황·다운로드 오류', '로그인·학교 코드 문제', '알림·이메일 미수신', '기타'];
const staffTicketInput = z.object({
  category: z.string().refine((c) => STAFF_CATEGORIES.includes(c), '문의 분류를 골라 주세요.'),
  sessionId: z.coerce.number().int().positive().nullable().optional(),
  content: z.string().trim().min(1, '내용을 적어 주세요.').max(2000),
});

export const UPLOAD_LIMIT = { limits: { fileSize: 5 * 1024 * 1024 } };

@Roles('staff')
@Controller('staff')
export class StaffController {
  constructor(
    private prisma: PrismaService,
    private listing: ListingService,
    private attendance: AttendanceService,
    private changes: ChangeRequestsService,
    private tickets: TicketsService,
    private imports: ImportService,
    private audit: AuditService,
  ) {}

  /** 권한이 "수정"인지 확인 */
  private async requireEdit(s: AuthSession) {
    const t = await this.prisma.staff.findUnique({ where: { id: s.id } });
    if (!t || !t.isActive) throw Errors.unauthorized();
    if (t.permission !== 'edit') throw Errors.forbidden('보기 권한만 있어요. 총관리자에게 수정 권한을 요청해 주세요.');
  }

  // ---------- 수업 목록 (출석 현황 거르기용) ----------
  @Get('sessions')
  sessions(@Auth() s: AuthSession, @Query('date') date?: string) {
    return this.listing.sessionsOn(isDateStr(date) ? date : kstToday(), s.schoolId);
  }

  // 강의실 코드 화면은 총관리자만 띄운다 (GET /api/admin/sessions/:id/code)

  // ---------- 출석 현황 ----------
  @Get('attendance')
  async list(@Auth() s: AuthSession, @Query() q: Record<string, string>) {
    const { rows, summary } = await this.listing.rows(this.filter(q, s.schoolId!));
    return { rows, summary };
  }

  @Get('attendance/export')
  async export(@Auth() s: AuthSession, @Query() q: Record<string, string>, @Res() res: Response) {
    const file = await this.listing.export(this.filter(q, s.schoolId!), q.format === 'csv' ? 'csv' : 'xlsx');
    sendFile(res, file);
  }

  private filter(q: Record<string, string>, schoolId: number) {
    return {
      date: isDateStr(q.date) ? q.date : kstToday(),
      sessionId: q.sessionId ? Number(q.sessionId) || undefined : undefined,
      schoolId,
      status: q.status || undefined,
      q: q.q?.trim() || undefined,
    };
  }

  // ---------- 기기 승인 ----------
  @Get('device-approvals')
  deviceApprovals(@Auth() s: AuthSession, @Query('status') status?: string) {
    return listDeviceApprovals(this.prisma, status === 'done' ? 'done' : 'pending', s.schoolId);
  }

  @Post('device-approvals/:id/approve')
  async approve(@Param('id', ParseIntPipe) id: number, @Auth() s: AuthSession) {
    await this.requireEdit(s);
    return this.attendance.decideDevice(id, { type: 'staff', id: s.id }, true, null, s.schoolId);
  }

  @Post('device-approvals/:id/reject')
  async reject(@Param('id', ParseIntPipe) id: number, @Body() body: unknown, @Auth() s: AuthSession) {
    await this.requireEdit(s);
    const b = parse(reasonInput, body);
    return this.attendance.decideDevice(id, { type: 'staff', id: s.id }, false, b.reason, s.schoolId);
  }

  // ---------- 학생·수강 ----------
  @Get('students')
  students(@Auth() s: AuthSession, @Query('q') q?: string) {
    return listStudents(this.prisma, s.schoolId, q);
  }

  @Post('students')
  async addStudent(@Body() body: unknown, @Auth() s: AuthSession) {
    await this.requireEdit(s);
    const b = parse(studentInput, body);
    const st = await this.prisma.student.create({ data: { ...b, schoolId: s.schoolId! } });
    return (await listStudents(this.prisma, s.schoolId, undefined, st.id))[0];
  }

  @Patch('students/:id')
  async editStudent(@Param('id', ParseIntPipe) id: number, @Body() body: unknown, @Auth() s: AuthSession) {
    await this.requireEdit(s);
    const b = parse(studentInput.partial(), body);
    const st = await this.prisma.student.findUnique({ where: { id } });
    if (!st || st.schoolId !== s.schoolId) throw Errors.notFound('학생');
    await this.prisma.student.update({ where: { id }, data: b });
    return (await listStudents(this.prisma, s.schoolId, undefined, id))[0];
  }

  @Post('students/:id/device-reset')
  @HttpCode(204)
  async deviceReset(@Param('id', ParseIntPipe) id: number, @Auth() s: AuthSession) {
    await this.requireEdit(s);
    const st = await this.prisma.student.findUnique({ where: { id } });
    if (!st || st.schoolId !== s.schoolId) throw Errors.notFound('학생');
    await this.prisma.device.updateMany({ where: { studentId: id, status: 'active' }, data: { status: 'retired', retiredAt: new Date() } });
    await this.audit.record({ type: 'staff', id: s.id }, 'device_reset', { type: 'student', id });
  }

  /** 담당 학교 학생 전원을 등록된 모든 수업에 수강 등록 */
  @Post('enrollments/all')
  async enrollAll(@Auth() s: AuthSession) {
    await this.requireEdit(s);
    const created = await enrollAllStudents(this.prisma, s.schoolId!);
    await this.audit.record({ type: 'staff', id: s.id }, 'enroll_all', { type: 'school', id: s.schoolId }, { created });
    return { created };
  }

  // ---------- 엑셀 일괄 등록 (학생·수강) ----------
  @Get('import/template')
  async template(@Res() res: Response) {
    sendFile(res, { buffer: await this.imports.template('students'), fileName: '학생_수강_등록_템플릿.xlsx', contentType: XLSX });
  }

  @Post('import/preview')
  @UseInterceptors(FileInterceptor('file', UPLOAD_LIMIT))
  async importPreview(@UploadedFile() file: Express.Multer.File | undefined, @Auth() s: AuthSession) {
    await this.requireEdit(s);
    if (!file) throw Errors.validation('엑셀 파일을 골라 주세요.');
    return this.imports.preview('students', file, { type: 'staff', id: s.id }, s.schoolId!);
  }

  @Post('import/:jobId/confirm')
  async importConfirm(@Param('jobId', ParseIntPipe) jobId: number, @Body() body: unknown, @Auth() s: AuthSession) {
    await this.requireEdit(s);
    const b = parse(modeInput, body);
    return this.imports.confirm(jobId, b.mode, { type: 'staff', id: s.id }, s.schoolId);
  }

  // ---------- 출결 변경 신청 ----------
  @Get('change-requests')
  changeRequests(@Auth() s: AuthSession) {
    return this.changes.listForStaff(s.schoolId!);
  }

  @Post('change-requests')
  async newChangeRequest(@Body() body: unknown, @Auth() s: AuthSession) {
    await this.requireEdit(s);
    const b = parse(changeInput, body);
    return this.changes.create(s.id, s.schoolId!, b);
  }

  // ---------- 문의함 ----------
  @Get('tickets')
  ticketList(@Auth() s: AuthSession, @Query('status') status?: string) {
    return this.tickets.listForStaff(s.schoolId!, status);
  }

  @Post('tickets')
  async newTicket(@Body() body: unknown, @Auth() s: AuthSession) {
    const b = parse(staffTicketInput, body);
    return this.tickets.createByStaff(s.id, { ...b, sessionId: b.sessionId ?? null });
  }

  @Post('tickets/:id/messages')
  reply(@Param('id', ParseIntPipe) id: number, @Body() body: unknown, @Auth() s: AuthSession) {
    const b = parse(messageInput, body);
    return this.tickets.reply(id, { type: 'staff', id: s.id }, b.body, s.schoolId);
  }

  @Post('tickets/:id/escalate')
  escalate(@Param('id', ParseIntPipe) id: number, @Auth() s: AuthSession) {
    return this.tickets.escalate(id, s.id, s.schoolId!);
  }

  @Post('tickets/:id/resolve')
  resolve(@Param('id', ParseIntPipe) id: number, @Auth() s: AuthSession) {
    return this.tickets.resolve(id, s.schoolId);
  }
}

// ---------- 인솔자·총관리자가 같이 쓰는 도우미 ----------

export const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export function sendFile(res: Response, f: { buffer: Buffer; fileName: string; contentType: string }) {
  res.setHeader('Content-Type', f.contentType);
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(f.fileName)}`);
  res.send(f.buffer);
}

export async function listStudents(prisma: PrismaService, schoolId?: number, q?: string, id?: number) {
  const list = await prisma.student.findMany({
    where: {
      ...(schoolId ? { schoolId } : {}),
      ...(id ? { id } : {}),
      ...(q ? { OR: [{ name: { contains: q } }, { studentNo: { contains: q } }] } : {}),
    },
    include: { school: true, devices: { where: { status: 'active' }, select: { id: true } }, _count: { select: { enrollments: true } } },
    orderBy: [{ schoolId: 'asc' }, { studentNo: 'asc' }],
  });
  return list.map((st) => ({
    id: st.id,
    schoolId: st.schoolId,
    schoolName: st.school.name,
    studentNo: st.studentNo,
    name: st.name,
    college: st.college,
    department: st.department,
    isActive: st.isActive,
    deviceStatus: st.devices.length > 0 ? 'registered' : 'none',
    enrolledSessions: st._count.enrollments,
  }));
}

export async function enrollAllStudents(prisma: PrismaService, schoolId: number) {
  const [students, sessions] = await Promise.all([
    prisma.student.findMany({ where: { schoolId, isActive: true }, select: { id: true } }),
    prisma.session.findMany({ select: { id: true } }),
  ]);
  const data = students.flatMap((st) => sessions.map((se) => ({ studentId: st.id, sessionId: se.id })));
  if (data.length === 0) return 0;
  const r = await prisma.enrollment.createMany({ data, skipDuplicates: true });
  return r.count;
}

export async function listDeviceApprovals(prisma: PrismaService, status: 'pending' | 'done', schoolId?: number) {
  const list = await prisma.deviceApproval.findMany({
    where: { status: status === 'pending' ? 'pending' : { in: ['approved', 'rejected'] }, ...(schoolId ? { attendance: { student: { schoolId } } } : {}) },
    include: { attendance: { include: { student: { include: { school: true } }, session: { include: { course: true } } } }, device: true },
    orderBy: { id: status === 'pending' ? 'asc' : 'desc' },
    take: 200,
  });
  // 이 기기가 다른 학생의 등록 기기인지
  const fps = [...new Set(list.map((a) => a.device.fingerprintHash))];
  const owners = await prisma.device.findMany({ where: { fingerprintHash: { in: fps }, status: 'active' }, include: { student: true } });
  const staffIds = list.filter((a) => a.decidedByType === 'staff' && a.decidedById).map((a) => a.decidedById!);
  const staff = new Map((await prisma.staff.findMany({ where: { id: { in: staffIds } } })).map((t) => [t.id, t.name]));
  return list.map((a) => {
    const owner = owners.find((o) => o.fingerprintHash === a.device.fingerprintHash && o.studentId !== a.device.studentId);
    const se = a.attendance.session;
    return {
      id: a.id,
      status: a.status,
      studentId: a.attendance.studentId,
      studentName: a.attendance.student.name,
      studentNo: a.attendance.student.studentNo,
      schoolName: a.attendance.student.school.name,
      sessionLabel: `${se.classDate.toISOString().slice(5, 10)} ${se.period}교시 ${se.course.name}`,
      requestedAt: a.requestedAt.toISOString(),
      userAgent: a.device.userAgent,
      distanceM: a.attendance.distanceM,
      ownerName: owner?.student.name ?? null,
      decidedAt: a.decidedAt?.toISOString() ?? null,
      decidedByName: a.decidedByType === 'admin' ? '총관리자' : a.decidedByType === 'system' ? '자동' : a.decidedById ? (staff.get(a.decidedById) ?? null) : null,
      rejectReason: a.rejectReason,
    };
  });
}
