// 총관리자 관리 API (모든 학교 데이터). Tailscale 관리자 입구에서만 들어온다.
import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Put, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { z } from 'zod';
import { AttendanceService } from '../attendance/attendance.service';
import { ChangeRequestsService } from '../attendance/change-requests.service';
import { ListingService } from '../attendance/listing.service';
import { TicketsService } from '../attendance/tickets.service';
import { AuditService } from '../common/audit.service';
import { hashSchoolCode } from '../common/crypto';
import { Errors, parse } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { addMinutes, dateOnly, isDateStr, isHHMM, kstToday, toDbDate } from '../common/time';
import { Auth, AuthSession, Roles } from '../auth/session';
import { ImportKind, ImportService } from '../excel/import.service';
import { MailService, SETTING, SettingsService } from '../mail/mail.service';
import { UPLOAD_LIMIT, XLSX, listDeviceApprovals, sendFile } from '../staff/staff.controller';
import { smtpInput } from './setup.controller';

const schoolInput = z.object({ name: z.string().trim().min(1, '학교명을 입력해 주세요.').max(50) });
const codeInput = z.object({ code: z.string().regex(/^\d{4}$/, '숫자 4자리로 입력해 주세요.') });
const staffInput = z.object({
  schoolId: z.coerce.number().int().positive('학교를 선택해 주세요.'),
  staffNo: z.string().trim().min(1, '직번을 입력해 주세요.').max(30),
  name: z.string().trim().min(1, '이름을 입력해 주세요.').max(30),
  email: z.string().trim().email('이메일 주소를 확인해 주세요.'),
  permission: z.enum(['view', 'edit']).default('edit'),
  isActive: z.boolean().optional(),
});
const locationInput = z.object({
  name: z.string().trim().min(1, '장소명을 입력해 주세요.').max(100),
  latitude: z.coerce.number().min(33, '위도를 확인해 주세요.').max(39, '위도를 확인해 주세요.'),
  longitude: z.coerce.number().min(124, '경도를 확인해 주세요.').max(132, '경도를 확인해 주세요.'),
  radiusM: z.coerce.number().int().min(10).max(1000).default(50),
});
const sessionInput = z
  .object({
    courseName: z.string().trim().min(1, '과목명을 입력해 주세요.').max(100),
    date: z.string().refine(isDateStr, '날짜를 확인해 주세요.'),
    period: z.coerce.number().int().min(0).max(20),
    startTime: z.string().refine(isHHMM, '시작 시각을 HH:MM으로 입력해 주세요.'),
    endTime: z.string().refine(isHHMM, '종료 시각을 HH:MM으로 입력해 주세요.'),
    locationId: z.coerce.number().int().positive('장소를 선택해 주세요.'),
  })
  .refine((v) => v.endTime > v.startTime, { message: '종료 시각은 시작 시각보다 늦어야 해요.', path: ['endTime'] });
const reasonInput = z.object({ reason: z.string().trim().min(1, '사유를 적어 주세요.').max(500) });
const messageInput = z.object({ body: z.string().trim().min(1, '내용을 적어 주세요.').max(2000) });
const modeInput = z.object({ mode: z.enum(['update', 'skip']).default('update') });
const KINDS: ImportKind[] = ['students', 'staff', 'locations', 'sessions'];
const KIND_FILE: Record<ImportKind, string> = { students: '학생_수강', staff: '인솔자', locations: '장소', sessions: '수업일정' };

@Roles('admin')
@Controller('admin')
export class AdminController {
  constructor(
    private prisma: PrismaService,
    private listing: ListingService,
    private attendance: AttendanceService,
    private changes: ChangeRequestsService,
    private tickets: TicketsService,
    private imports: ImportService,
    private audit: AuditService,
    private settings: SettingsService,
    private mail: MailService,
  ) {}

  // ---------- 대시보드 ----------
  @Get('dashboard')
  async dashboard() {
    const date = kstToday();
    const { rows } = await this.listing.rows({ date });
    const attended = rows.filter((r) => r.status === 'present' || r.status === 'late').length;
    const schools = await this.prisma.school.findMany({ orderBy: { name: 'asc' } });
    const openTickets = await this.prisma.ticket.groupBy({ by: ['schoolId'], where: { status: { in: ['open', 'in_progress', 'escalated'] } }, _count: true });
    const incident = await this.prisma.incident.findFirst({ where: { resolvedAt: null }, orderBy: { id: 'desc' } });
    const startOfDay = new Date(`${date}T00:00:00+09:00`);
    return {
      date,
      attendanceRate: { percent: rows.length ? Math.round((attended / rows.length) * 100) : 0, attended, total: rows.length },
      pendingChangeRequests: await this.changes.listForAdmin('pending'),
      reviewChangeRequests: await this.changes.listForAdmin('auto_rejected'),
      adminTickets: await this.tickets.listForAdmin('admin', 'open'),
      staffOpenTickets: await this.prisma.ticket.count({ where: { assignee: 'staff', status: { in: ['open', 'in_progress'] } } }),
      pendingDeviceApprovals: await this.prisma.deviceApproval.count({ where: { status: 'pending' } }),
      suspiciousToday: rows.filter((r) => r.suspicious).length,
      proxyCanceledToday: await this.prisma.penalty.count({ where: { kind: 'attendance_cancel', createdAt: { gte: startOfDay } } }),
      system: incident ? { status: incident.severity === 'critical' ? 'critical' : 'warning', message: `${incident.component}: ${incident.message}` } : { status: 'ok', message: '정상' },
      schools: schools.map((s) => {
        const mine = rows.filter((r) => r.schoolName === s.name);
        const att = mine.filter((r) => r.status === 'present' || r.status === 'late').length;
        return {
          schoolId: s.id,
          schoolName: s.name,
          percent: mine.length ? Math.round((att / mine.length) * 100) : 0,
          none: mine.filter((r) => r.status === 'none').length,
          suspicious: mine.filter((r) => r.suspicious).length,
          openTickets: openTickets.find((t) => t.schoolId === s.id)?._count ?? 0,
        };
      }),
    };
  }

  // ---------- 학교·학교 코드 ----------
  @Get('schools')
  schools() {
    return this.schoolList();
  }
  private async schoolList(id?: number) {
    const list = await this.prisma.school.findMany({ where: id ? { id } : {}, include: { _count: { select: { students: true, staff: true } } }, orderBy: { name: 'asc' } });
    return list.map((s) => ({ id: s.id, name: s.name, codeSet: !!s.codeHash, codeChangedAt: s.codeChangedAt?.toISOString() ?? null, studentCount: s._count.students, staffCount: s._count.staff }));
  }

  @Post('schools')
  async addSchool(@Body() body: unknown) {
    const s = await this.prisma.school.create({ data: parse(schoolInput, body) });
    return (await this.schoolList(s.id))[0];
  }

  @Patch('schools/:id')
  async editSchool(@Param('id', ParseIntPipe) id: number, @Body() body: unknown) {
    await this.prisma.school.update({ where: { id }, data: parse(schoolInput, body) });
    return (await this.schoolList(id))[0];
  }

  @Put('schools/:id/code')
  async setCode(@Param('id', ParseIntPipe) id: number, @Body() body: unknown, @Auth() s: AuthSession) {
    const b = parse(codeInput, body);
    await this.prisma.school.update({ where: { id }, data: { codeHash: hashSchoolCode(b.code), codeChangedAt: new Date() } });
    await this.audit.record({ type: 'admin', id: s.id }, 'school_code_changed', { type: 'school', id });
    return (await this.schoolList(id))[0];
  }

  // ---------- 인솔자 계정 ----------
  @Get('staff')
  staff() {
    return this.staffList();
  }
  private async staffList(id?: number) {
    const list = await this.prisma.staff.findMany({ where: id ? { id } : {}, include: { school: true }, orderBy: [{ schoolId: 'asc' }, { staffNo: 'asc' }] });
    return list.map((t) => ({ id: t.id, schoolId: t.schoolId, schoolName: t.school.name, staffNo: t.staffNo, name: t.name, email: t.email, permission: t.permission, isActive: t.isActive }));
  }

  @Post('staff')
  async addStaff(@Body() body: unknown) {
    const t = await this.prisma.staff.create({ data: parse(staffInput, body) });
    return (await this.staffList(t.id))[0];
  }

  @Patch('staff/:id')
  async editStaff(@Param('id', ParseIntPipe) id: number, @Body() body: unknown) {
    await this.prisma.staff.update({ where: { id }, data: parse(staffInput.partial(), body) });
    return (await this.staffList(id))[0];
  }

  // ---------- 장소·수업 일정 ----------
  @Get('locations')
  async locations() {
    const list = await this.prisma.location.findMany({ orderBy: { name: 'asc' } });
    return list.map(locOut);
  }

  @Post('locations')
  async addLocation(@Body() body: unknown) {
    return locOut(await this.prisma.location.create({ data: parse(locationInput, body) }));
  }

  @Patch('locations/:id')
  async editLocation(@Param('id', ParseIntPipe) id: number, @Body() body: unknown) {
    return locOut(await this.prisma.location.update({ where: { id }, data: parse(locationInput.partial(), body) }));
  }

  @Get('sessions')
  async sessions(@Query('from') from?: string, @Query('to') to?: string) {
    const f = isDateStr(from) ? from : kstToday();
    const t = isDateStr(to) ? to : dateOnly(addMinutes(toDbDate(f), 14 * 24 * 60));
    const list = await this.prisma.session.findMany({
      where: { classDate: { gte: toDbDate(f), lte: toDbDate(t) } },
      include: { course: true, location: true, _count: { select: { enrollments: true } } },
      orderBy: [{ classDate: 'asc' }, { startTime: 'asc' }, { period: 'asc' }],
    });
    return list.map(sessionOut);
  }

  @Post('sessions')
  async addSession(@Body() body: unknown) {
    const b = parse(sessionInput, body);
    const course = await this.prisma.course.upsert({ where: { name: b.courseName }, create: { name: b.courseName }, update: {} });
    const s = await this.prisma.session.create({
      data: { courseId: course.id, classDate: toDbDate(b.date), period: b.period, startTime: b.startTime, endTime: b.endTime, locationId: b.locationId },
      include: { course: true, location: true, _count: { select: { enrollments: true } } },
    });
    return sessionOut(s);
  }

  @Patch('sessions/:id')
  async editSession(@Param('id', ParseIntPipe) id: number, @Body() body: unknown) {
    const cur = await this.prisma.session.findUnique({ where: { id }, include: { course: true } });
    if (!cur) throw Errors.notFound('수업');
    const b = parse(sessionInput, { courseName: cur.course.name, date: dateOnly(cur.classDate), period: cur.period, startTime: cur.startTime, endTime: cur.endTime, locationId: cur.locationId, ...(body as object) });
    const course = await this.prisma.course.upsert({ where: { name: b.courseName }, create: { name: b.courseName }, update: {} });
    const s = await this.prisma.session.update({
      where: { id },
      data: { courseId: course.id, classDate: toDbDate(b.date), period: b.period, startTime: b.startTime, endTime: b.endTime, locationId: b.locationId },
      include: { course: true, location: true, _count: { select: { enrollments: true } } },
    });
    return sessionOut(s);
  }

  @Delete('sessions/:id')
  @HttpCode(204)
  async deleteSession(@Param('id', ParseIntPipe) id: number, @Auth() s: AuthSession) {
    const used = await this.prisma.attendance.count({ where: { sessionId: id } });
    if (used > 0) throw Errors.conflict('IN_USE', '이미 출석 기록이 있는 수업은 지울 수 없어요. 시간·장소를 고쳐 주세요.');
    await this.prisma.attendanceAttempt.deleteMany({ where: { sessionId: id } });
    await this.prisma.session.delete({ where: { id } });
    await this.audit.record({ type: 'admin', id: s.id }, 'session_deleted', { type: 'session', id });
  }

  // ---------- 엑셀 일괄 등록 ----------
  @Get('import/:kind/template')
  async template(@Param('kind') kind: string, @Res() res: Response) {
    const k = this.kind(kind);
    sendFile(res, { buffer: await this.imports.template(k), fileName: `${KIND_FILE[k]}_등록_템플릿.xlsx`, contentType: XLSX });
  }

  @Post('import/:kind/preview')
  @UseInterceptors(FileInterceptor('file', UPLOAD_LIMIT))
  async preview(@Param('kind') kind: string, @UploadedFile() file: Express.Multer.File | undefined, @Body('schoolId') schoolId: string | undefined, @Auth() s: AuthSession) {
    if (!file) throw Errors.validation('엑셀 파일을 골라 주세요.');
    return this.imports.preview(this.kind(kind), file, { type: 'admin', id: s.id }, schoolId ? Number(schoolId) : null);
  }

  @Post('import/:jobId/confirm')
  confirm(@Param('jobId', ParseIntPipe) jobId: number, @Body() body: unknown, @Auth() s: AuthSession) {
    return this.imports.confirm(jobId, parse(modeInput, body).mode, { type: 'admin', id: s.id });
  }

  private kind(k: string): ImportKind {
    if (!KINDS.includes(k as ImportKind)) throw Errors.notFound('등록 종류');
    return k as ImportKind;
  }

  // ---------- 전체 출석 현황 ----------
  @Get('attendance')
  async attendanceList(@Query() q: Record<string, string>) {
    const { rows, summary } = await this.listing.rows(this.filter(q));
    return { rows, summary };
  }

  @Get('attendance/export')
  async export(@Query() q: Record<string, string>, @Res() res: Response) {
    sendFile(res, await this.listing.export(this.filter(q), q.format === 'csv' ? 'csv' : 'xlsx'));
  }

  private filter(q: Record<string, string>) {
    return {
      date: isDateStr(q.date) ? q.date : kstToday(),
      sessionId: Number(q.sessionId) || undefined,
      schoolId: Number(q.schoolId) || undefined,
      status: q.status || undefined,
      q: q.q?.trim() || undefined,
    };
  }

  // ---------- 출결 변경 승인 ----------
  @Get('change-requests')
  changeRequests(@Query('status') status?: string) {
    return this.changes.listForAdmin(['pending', 'auto_rejected', 'done'].includes(status ?? '') ? status! : 'pending');
  }

  @Post('change-requests/:id/approve')
  approve(@Param('id', ParseIntPipe) id: number, @Auth() s: AuthSession) {
    return this.changes.approve(id, s.id);
  }

  @Post('change-requests/:id/reject')
  reject(@Param('id', ParseIntPipe) id: number, @Body() body: unknown, @Auth() s: AuthSession) {
    return this.changes.reject(id, s.id, parse(reasonInput, body).reason);
  }

  // ---------- 기기 승인 (전체 학교) ----------
  @Get('device-approvals')
  deviceApprovals(@Query('status') status?: string) {
    return listDeviceApprovals(this.prisma, status === 'done' ? 'done' : 'pending');
  }

  @Post('device-approvals/:id/approve')
  approveDevice(@Param('id', ParseIntPipe) id: number, @Auth() s: AuthSession) {
    return this.attendance.decideDevice(id, { type: 'admin', id: s.id }, true, null);
  }

  @Post('device-approvals/:id/reject')
  rejectDevice(@Param('id', ParseIntPipe) id: number, @Body() body: unknown, @Auth() s: AuthSession) {
    return this.attendance.decideDevice(id, { type: 'admin', id: s.id }, false, parse(reasonInput, body).reason);
  }

  // ---------- 문의 ----------
  @Get('tickets')
  ticketList(@Query('scope') scope?: string, @Query('status') status?: string) {
    return this.tickets.listForAdmin(scope === 'all' ? 'all' : 'admin', status || undefined);
  }

  @Post('tickets/:id/messages')
  reply(@Param('id', ParseIntPipe) id: number, @Body() body: unknown, @Auth() s: AuthSession) {
    return this.tickets.reply(id, { type: 'admin', id: s.id }, parse(messageInput, body).body);
  }

  @Post('tickets/:id/resolve')
  resolve(@Param('id', ParseIntPipe) id: number) {
    return this.tickets.resolve(id);
  }

  // ---------- 이메일 설정 변경 ----------
  @Put('settings/smtp')
  async saveSmtp(@Body() body: unknown, @Auth() s: AuthSession) {
    const b = parse(smtpInput, body);
    const current = await this.settings.getSmtp();
    const password = b.password || current?.password;
    if (!password) throw Errors.validation('앱 비밀번호를 입력해 주세요.');
    const smtp = { host: b.host, port: b.port, secure: b.secure, user: b.user, password, fromName: b.fromName };
    await this.mail.testSmtp(smtp, b.testTo);
    await this.settings.saveSmtp(smtp, s.id);
    await this.settings.set(SETTING.adminEmail, b.testTo, { adminId: s.id });
    await this.audit.record({ type: 'admin', id: s.id }, 'smtp_changed');
    return { host: smtp.host, port: smtp.port, secure: smtp.secure, user: smtp.user, fromName: smtp.fromName, passwordSet: true };
  }
}

const locOut = (l: { id: number; name: string; latitude: unknown; longitude: unknown; radiusM: number }) => ({
  id: l.id,
  name: l.name,
  latitude: Number(l.latitude),
  longitude: Number(l.longitude),
  radiusM: l.radiusM,
});

const sessionOut = (s: { id: number; classDate: Date; period: number; startTime: string; endTime: string; locationId: number; course: { name: string }; location: { name: string }; _count: { enrollments: number } }) => ({
  id: s.id,
  date: dateOnly(s.classDate),
  period: s.period,
  courseName: s.course.name,
  locationId: s.locationId,
  locationName: s.location.name,
  startTime: s.startTime,
  endTime: s.endTime,
  enrolled: s._count.enrollments,
});
