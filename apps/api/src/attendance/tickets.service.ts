// 문의·오류 신고. 학생 문의 → 같은 학교 인솔자 처리 (어려우면 총관리자에게 넘김) / 인솔자 문의 → 총관리자
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Errors } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { dateOnly } from '../common/time';
import { MailService } from '../mail/mail.service';

const include = { school: true, session: { include: { course: true } }, messages: { orderBy: { id: 'asc' as const } } };
type TicketFull = Prisma.TicketGetPayload<{ include: typeof include }>;

@Injectable()
export class TicketsService {
  constructor(
    private prisma: PrismaService,
    private mail: MailService,
  ) {}

  /** 화면용 모양으로 바꾼다 (작성자·답변자 이름 채우기) */
  async present(list: TicketFull[]) {
    const studentIds = new Set<number>();
    const staffIds = new Set<number>();
    for (const t of list) {
      (t.reporterType === 'student' ? studentIds : staffIds).add(t.reporterId);
      for (const m of t.messages) if (m.authorId) (m.authorType === 'student' ? studentIds : m.authorType === 'staff' ? staffIds : new Set()).add(m.authorId);
    }
    const [students, staff] = await Promise.all([
      this.prisma.student.findMany({ where: { id: { in: [...studentIds] } } }),
      this.prisma.staff.findMany({ where: { id: { in: [...staffIds] } } }),
    ]);
    const sName = new Map(students.map((s) => [s.id, `${s.name}(${s.studentNo})`]));
    const tName = new Map(staff.map((s) => [s.id, s.name]));
    const nameOf = (type: string, id: number | null) => (type === 'admin' ? '총관리자' : type === 'student' ? sName.get(id!) : tName.get(id!)) ?? '-';
    return list.map((t) => ({
      id: t.id,
      schoolName: t.school.name,
      reporterType: t.reporterType,
      reporterName: nameOf(t.reporterType, t.reporterId),
      studentId: t.reporterType === 'student' ? t.reporterId : null,
      category: t.category,
      content: t.content,
      sessionId: t.sessionId,
      sessionLabel: t.session ? `${t.session.period}교시 ${t.session.course.name} (${dateOnly(t.session.classDate).slice(5)})` : null,
      status: t.status,
      assignee: t.assignee,
      diagnostics: (t.diagnostics as Record<string, unknown>) ?? null,
      createdAt: t.createdAt.toISOString(),
      messages: t.messages.map((m) => ({ id: m.id, authorType: m.authorType, authorName: nameOf(m.authorType, m.authorId), body: m.body, createdAt: m.createdAt.toISOString() })),
    }));
  }

  async one(id: number) {
    const t = await this.prisma.ticket.findUnique({ where: { id }, include });
    if (!t) throw Errors.notFound('문의');
    return (await this.present([t]))[0];
  }

  async createByStudent(studentId: number, input: { category: string; sessionId: number | null; content: string; diagnostics?: Record<string, unknown> }) {
    const student = await this.prisma.student.findUniqueOrThrow({ where: { id: studentId } });
    // 서버가 마지막 출석 시도 결과를 붙인다 (좌표는 없음)
    const last = await this.prisma.attendanceAttempt.findFirst({ where: { studentId }, orderBy: { id: 'desc' } });
    const diagnostics = {
      ...(input.diagnostics ?? {}),
      lastAttempt: last ? { result: last.result, at: last.attemptedAt.toISOString(), distanceM: last.distanceM, accuracyM: last.gpsAccuracyM } : null,
    };
    const t = await this.prisma.ticket.create({
      data: { schoolId: student.schoolId, sessionId: input.sessionId, reporterType: 'student', reporterId: studentId, category: input.category, content: input.content, diagnostics },
    });
    await this.mail.notifySchoolStaff(student.schoolId, 'ticket', `새 학생 문의 · ${student.name}`, `[${input.category}] ${student.name}(${student.studentNo})\n${input.content}\n\n인솔자 화면의 "문의함"에서 확인해 주세요.`);
    return this.one(t.id);
  }

  async createByStaff(staffId: number, input: { category: string; sessionId: number | null; content: string; diagnostics?: Record<string, unknown> }) {
    const staff = await this.prisma.staff.findUniqueOrThrow({ where: { id: staffId }, include: { school: true } });
    const t = await this.prisma.ticket.create({
      data: { schoolId: staff.schoolId, sessionId: input.sessionId, reporterType: 'staff', reporterId: staffId, category: input.category, content: input.content, diagnostics: (input.diagnostics as object) ?? undefined, assignee: 'admin', status: 'escalated', escalatedAt: new Date() },
    });
    await this.mail.notifyAdmins('ticket', `인솔자 문의 · ${staff.school.name} ${staff.name}`, `[${input.category}]\n${input.content}`);
    return this.one(t.id);
  }

  async listForStudent(studentId: number) {
    const list = await this.prisma.ticket.findMany({ where: { reporterType: 'student', reporterId: studentId }, include, orderBy: { id: 'desc' } });
    return this.present(list);
  }

  /** 인솔자 문의함. status: open(처리할 문의: 접수·처리 중) / escalated / resolved */
  async listForStaff(schoolId: number, status?: string) {
    const where: Prisma.TicketWhereInput = { schoolId, reporterType: 'student' };
    if (status === 'open') where.status = { in: ['open', 'in_progress'] };
    else if (status) where.status = status;
    const list = await this.prisma.ticket.findMany({ where, include, orderBy: { id: 'desc' }, take: 200 });
    return this.present(list);
  }

  /** 총관리자: scope=admin(넘겨받은 문의·인솔자 문의) / all(전체 기록) */
  async listForAdmin(scope: string, status?: string) {
    const where: Prisma.TicketWhereInput = scope === 'all' ? {} : { assignee: 'admin' };
    if (status === 'open') where.status = { in: ['open', 'in_progress', 'escalated'] };
    else if (status) where.status = status;
    const list = await this.prisma.ticket.findMany({ where, include, orderBy: { id: 'desc' }, take: 300 });
    return this.present(list);
  }

  private async ensureScope(id: number, schoolId?: number) {
    const t = await this.prisma.ticket.findUnique({ where: { id } });
    if (!t) throw Errors.notFound('문의');
    if (schoolId !== undefined && t.schoolId !== schoolId) throw Errors.forbidden();
    return t;
  }

  async reply(id: number, author: { type: 'staff' | 'admin'; id: number }, body: string, schoolId?: number) {
    const t = await this.ensureScope(id, schoolId);
    await this.prisma.ticketMessage.create({ data: { ticketId: id, authorType: author.type, authorId: author.id, body } });
    if (t.status === 'open') await this.prisma.ticket.update({ where: { id }, data: { status: 'in_progress' } });
    if (author.type === 'admin' && t.reporterType === 'staff') await this.mail.notifyStaff(t.reporterId, 'ticket', '문의에 답변이 달렸어요', body);
    return this.one(id);
  }

  async escalate(id: number, staffId: number, schoolId: number) {
    const t = await this.ensureScope(id, schoolId);
    if (t.status === 'resolved') throw Errors.conflict('RESOLVED', '이미 해결된 문의예요.');
    await this.prisma.ticket.update({ where: { id }, data: { status: 'escalated', assignee: 'admin', escalatedAt: new Date() } });
    const staff = await this.prisma.staff.findUnique({ where: { id: staffId }, include: { school: true } });
    await this.mail.notifyAdmins('ticket', `이관된 문의 · ${staff?.school.name ?? ''}`, `[${t.category}] ${t.content}\n\n넘긴 인솔자: ${staff?.name ?? ''}`);
    return this.one(id);
  }

  async resolve(id: number, schoolId?: number) {
    await this.ensureScope(id, schoolId);
    await this.prisma.ticket.update({ where: { id }, data: { status: 'resolved', resolvedAt: new Date() } });
    return this.one(id);
  }
}
