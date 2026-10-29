// 출결 변경 신청: 인솔자는 신청만 하고, 총관리자가 승인해야 출석이 바뀐다.
// 10분 안에 총관리자가 답하지 않으면 "우선 거절"(auto_rejected) → 재검토 대기에서 나중에 승인할 수 있다.
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Errors } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { addMinutes, dateOnly } from '../common/time';
import { MailService } from '../mail/mail.service';
import { STATUS_LABEL } from './rules';

/** 총관리자가 답해야 하는 시간 (분) */
export const DECISION_LIMIT_MIN = 10;

const include = {
  attendance: { include: { student: { include: { school: true } }, session: { include: { course: true } } } },
  requester: true,
  decider: true,
};
type Full = Prisma.AttendanceChangeRequestGetPayload<{ include: typeof include }>;

export const present = (r: Full) => ({
  id: r.id,
  status: r.status,
  schoolName: r.attendance.student.school.name,
  studentName: r.attendance.student.name,
  studentNo: r.attendance.student.studentNo,
  sessionLabel: `${dateOnly(r.attendance.session.classDate).slice(5)} ${r.attendance.session.period}교시 ${r.attendance.session.course.name}`,
  fromStatus: r.fromStatus,
  toStatus: r.toStatus,
  reason: r.reason,
  requestedByName: r.requester.name,
  ticketId: r.ticketId,
  createdAt: r.createdAt.toISOString(),
  deadlineAt: addMinutes(r.createdAt, DECISION_LIMIT_MIN).toISOString(),
  autoRejectedAt: r.autoRejectedAt?.toISOString() ?? null,
  decidedAt: r.decidedAt?.toISOString() ?? null,
  decidedByName: r.decider?.username ?? (r.status === 'auto_rejected' ? '자동 (시간 초과)' : null),
  rejectReason: r.rejectReason,
});

@Injectable()
export class ChangeRequestsService {
  constructor(
    private prisma: PrismaService,
    private mail: MailService,
  ) {}

  async create(staffId: number, schoolId: number, input: { studentId: number; sessionId: number; toStatus: string; reason: string; ticketId?: number | null }) {
    const student = await this.prisma.student.findUnique({ where: { id: input.studentId } });
    if (!student || student.schoolId !== schoolId) throw Errors.forbidden('담당 학교 학생만 신청할 수 있어요.');
    const enrolled = await this.prisma.enrollment.findUnique({ where: { studentId_sessionId: { studentId: input.studentId, sessionId: input.sessionId } } });
    if (!enrolled) throw Errors.validation('이 학생은 이 수업의 수강생이 아니에요.');

    const created = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(1, ${input.sessionId}::int)`;
      // 미출이면 결석 행을 먼저 만든다 (ERD 규칙)
      let att = await tx.attendance.findUnique({ where: { studentId_sessionId: { studentId: input.studentId, sessionId: input.sessionId } } });
      if (!att) att = await tx.attendance.create({ data: { studentId: input.studentId, sessionId: input.sessionId, status: 'absent', decidedAt: new Date() } });
      if (att.status === input.toStatus) throw Errors.validation('지금 상태와 같은 상태로는 바꿀 수 없어요.');
      if (att.status === 'pending_device') throw Errors.validation('기기 승인 대기 중인 출석은 "기기 승인" 화면에서 처리해 주세요.');
      const open = await tx.attendanceChangeRequest.findFirst({ where: { attendanceId: att.id, status: { in: ['pending', 'auto_rejected'] } } });
      if (open) throw Errors.conflict('ALREADY_REQUESTED', '이 출석에는 이미 처리 중인 변경 신청이 있어요.');
      return tx.attendanceChangeRequest.create({
        data: { attendanceId: att.id, ticketId: input.ticketId ?? null, requestedBy: staffId, fromStatus: att.status, toStatus: input.toStatus, reason: input.reason },
        include,
      });
    });
    const p = present(created);
    await this.mail.notifyAdmins(
      'change_request',
      `출결 변경 신청 · ${p.schoolName} ${p.studentName}`,
      `${p.sessionLabel}\n${STATUS_LABEL[p.fromStatus]} → ${STATUS_LABEL[p.toStatus]}\n사유: ${p.reason}\n신청: ${p.requestedByName}\n\n${DECISION_LIMIT_MIN}분 안에 승인하지 않으면 우선 거절되고, 재검토 대기에서 나중에 승인할 수 있어요.`,
    );
    return p;
  }

  async listForStaff(schoolId: number) {
    const list = await this.prisma.attendanceChangeRequest.findMany({ where: { attendance: { student: { schoolId } } }, include, orderBy: { id: 'desc' }, take: 200 });
    return list.map(present);
  }

  /** status: pending / auto_rejected / done(승인·거절 완료) */
  async listForAdmin(status: string) {
    const where: Prisma.AttendanceChangeRequestWhereInput = status === 'done' ? { status: { in: ['approved', 'rejected'] } } : { status };
    const list = await this.prisma.attendanceChangeRequest.findMany({ where, include, orderBy: { id: status === 'done' ? 'desc' : 'asc' }, take: 300 });
    return list.map(present);
  }

  /** 승인 → 출석 상태를 바꾸고 이력을 남긴다 (재검토 대기 건도 같은 방법) */
  async approve(id: number, adminId: number) {
    const now = new Date();
    const r = await this.prisma.$transaction(async (tx) => {
      const req = await tx.attendanceChangeRequest.findUnique({ where: { id } });
      if (!req) throw Errors.notFound('변경 신청');
      if (req.status !== 'pending' && req.status !== 'auto_rejected') throw Errors.conflict('ALREADY_DECIDED', '이미 처리된 신청이에요.');
      const att = await tx.attendance.findUniqueOrThrow({ where: { id: req.attendanceId } });
      await tx.attendance.update({ where: { id: att.id }, data: { status: req.toStatus, decidedAt: now } });
      await tx.attendanceChange.create({
        data: { attendanceId: att.id, requestId: req.id, fromStatus: att.status, toStatus: req.toStatus, reason: req.reason, changedByType: 'admin', changedById: adminId },
      });
      return tx.attendanceChangeRequest.update({ where: { id }, data: { status: 'approved', decidedBy: adminId, decidedAt: now }, include });
    });
    const p = present(r);
    await this.mail.notifyStaff(r.requestedBy, 'change_request', `출결 변경 승인 · ${p.studentName}`, `${p.sessionLabel} ${STATUS_LABEL[p.fromStatus]} → ${STATUS_LABEL[p.toStatus]} 변경이 승인되었어요.`);
    return p;
  }

  async reject(id: number, adminId: number, reason: string) {
    const req = await this.prisma.attendanceChangeRequest.findUnique({ where: { id } });
    if (!req) throw Errors.notFound('변경 신청');
    if (req.status !== 'pending' && req.status !== 'auto_rejected') throw Errors.conflict('ALREADY_DECIDED', '이미 처리된 신청이에요.');
    const r = await this.prisma.attendanceChangeRequest.update({ where: { id }, data: { status: 'rejected', decidedBy: adminId, decidedAt: new Date(), rejectReason: reason }, include });
    const p = present(r);
    await this.mail.notifyStaff(r.requestedBy, 'change_request', `출결 변경 거절 · ${p.studentName}`, `${p.sessionLabel} 변경 신청이 거절되었어요.\n사유: ${reason}`);
    return p;
  }

  /** Worker가 1분마다 부른다: 10분 지난 대기 신청을 우선 거절 */
  async autoRejectExpired(now = new Date()) {
    const limit = addMinutes(now, -DECISION_LIMIT_MIN);
    const expired = await this.prisma.attendanceChangeRequest.findMany({ where: { status: 'pending', createdAt: { lte: limit } }, include });
    for (const r of expired) {
      const updated = await this.prisma.attendanceChangeRequest.updateMany({ where: { id: r.id, status: 'pending' }, data: { status: 'auto_rejected', autoRejectedAt: now } });
      if (updated.count === 0) continue;
      const p = present(r);
      await this.mail.notifyStaff(
        r.requestedBy,
        'change_auto_rejected',
        `출결 변경 우선 거절 · ${p.studentName}`,
        `${p.sessionLabel} 변경 신청에 총관리자가 ${DECISION_LIMIT_MIN}분 안에 답하지 않아 우선 거절되었어요. 출석은 그대로예요.\n총관리자가 나중에 다시 확인해 승인할 수 있으니 다시 신청하지 않아도 돼요.`,
      );
    }
    return expired.length;
  }
}
