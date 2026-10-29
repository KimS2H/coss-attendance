// ─────────────────────────────────────────────
// 출석 처리의 중심. 판정 순서: ① 시간 → ② 거리 → ③ 코드 → ④ 같은 기기(대리 출석) → ⑤ 등록 기기
// 자세한 규칙: docs/attendance-flow.md
// ─────────────────────────────────────────────
import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Errors } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { dateOnly, kstHHMM, kstToday, shiftHHMM, toDbDate } from '../common/time';
import { MailService } from '../mail/mail.service';
import {
  RESULT_MESSAGES,
  STATUS_LABEL,
  classifyTime,
  distanceM,
  sessionWindow,
  statusAtApproval,
  verifyRoomCode,
  withinRange,
} from './rules';

type Tx = Prisma.TransactionClient;
export type Actor = { type: 'staff' | 'admin'; id: number };

export type AttendInput = { sessionId: number; code: string; location: { lat: number; lng: number; accuracy: number } | null };

const PROXY_REASON_CANCELED = '다른 학생 기기로 출석 (자동 취소)';
const PROXY_REASON_SAME = '같은 기기 2명';
const OTHER_OWNER_REASON = '다른 학생의 등록 기기';

@Injectable()
export class AttendanceService {
  private log = new Logger('Attendance');
  constructor(
    private prisma: PrismaService,
    private mail: MailService,
  ) {}

  // ========== 기기 ==========

  /**
   * 로그인할 때 기기 확인.
   * 등록 기기가 없는 학생이면 이 기기를 등록한다. 단, 이 기기가 다른 학생의 등록 기기이면 등록하지 않는다.
   */
  async checkDeviceOnLogin(studentId: number, fp: string, userAgent: string): Promise<'registered' | 'newly_registered' | 'unregistered'> {
    return this.prisma.$transaction(async (tx) => {
      const mine = await tx.device.findUnique({ where: { studentId_fingerprintHash: { studentId, fingerprintHash: fp } } });
      if (mine?.status === 'active') return 'registered';
      const hasActive = await tx.device.findFirst({ where: { studentId, status: 'active' } });
      if (hasActive) return 'unregistered';
      const ownedByOther = await tx.device.findFirst({ where: { fingerprintHash: fp, status: 'active', NOT: { studentId } } });
      if (ownedByOther) return 'unregistered';
      if (mine) await tx.device.update({ where: { id: mine.id }, data: { status: 'active', retiredAt: null, userAgent } });
      else await tx.device.create({ data: { studentId, fingerprintHash: fp, userAgent, status: 'active' } });
      return 'newly_registered';
    });
  }

  /** 출석에 쓴 기기 행을 찾거나 만든다 (학생·브라우저마다 1행) */
  private async ensureDevice(tx: Tx, studentId: number, fp: string, userAgent: string) {
    const found = await tx.device.findUnique({ where: { studentId_fingerprintHash: { studentId, fingerprintHash: fp } } });
    if (found) return found;
    return tx.device.create({ data: { studentId, fingerprintHash: fp, userAgent, status: 'pending' } });
  }

  // ========== 오늘 수업 ==========

  async today(studentId: number) {
    const date = kstToday();
    const now = new Date();
    const enrollments = await this.prisma.enrollment.findMany({
      where: { studentId, session: { classDate: toDbDate(date) } },
      include: { session: { include: { course: true, location: true, attendances: { where: { studentId } } } } },
    });
    const sessions = enrollments
      .map((e) => e.session)
      .sort((a, b) => a.startTime.localeCompare(b.startTime) || a.period - b.period)
      .map((s) => {
        const a = s.attendances[0];
        return {
          id: s.id,
          period: s.period,
          courseName: s.course.name,
          locationName: s.location.name,
          startTime: s.startTime,
          endTime: s.endTime,
          attendFrom: shiftHHMM(s.startTime, -5),
          lateFrom: shiftHHMM(s.startTime, 5),
          status: (a?.status ?? 'none') as string,
          checkedAt: a?.checkedAt?.toISOString() ?? null,
          suspicious: a?.suspicious ?? false,
          window: sessionWindow(date, s.startTime, s.endTime),
        };
      });
    // 지금 출석할 수 있는 수업 → 없으면 가장 가까운 다음 수업
    const open = sessions.find((s) => now >= s.window.attendFrom && now < s.window.end);
    const next = sessions.find((s) => now < s.window.attendFrom);
    return {
      serverTime: now.toISOString(),
      date,
      currentSessionId: (open ?? next)?.id ?? null,
      sessions: sessions.map(({ window: _w, ...rest }) => rest),
    };
  }

  // ========== 출석하기 ==========

  async attend(studentId: number, fp: string, userAgent: string, input: AttendInput) {
    const now = new Date();
    const session = await this.prisma.session.findUnique({ where: { id: input.sessionId }, include: { location: true, course: true } });
    const enrolled = session && (await this.prisma.enrollment.findUnique({ where: { studentId_sessionId: { studentId, sessionId: session.id } } }));
    if (!session || !enrolled) return this.respond('not_enrolled', 'none', null, null, 50, '');

    const date = dateOnly(session.classDate);
    const w = sessionWindow(date, session.startTime, session.endTime);
    const radius = session.location.radiusM;
    const attendFrom = shiftHHMM(session.startTime, -5);

    const existing = await this.prisma.attendance.findUnique({ where: { studentId_sessionId: { studentId, sessionId: session.id } } });
    if (existing) return this.respond('already', existing.status, existing.decidedAt, existing.distanceM, radius, attendFrom);

    // 시도 기록용 기기 행 (실패해도 어느 기기로 시도했는지 남긴다)
    const device = await this.prisma.$transaction((tx) => this.ensureDevice(tx, studentId, fp, userAgent));
    const fail = async (result: string, dist: number | null = null, acc: number | null = null) => {
      await this.prisma.attendanceAttempt.create({
        data: { studentId, sessionId: session.id, deviceId: device.id, result, distanceM: dist, gpsAccuracyM: acc },
      });
      return this.respond(result, 'none', null, dist, radius, attendFrom);
    };

    // ① 시간
    const timing = classifyTime(now, w);
    if (timing === 'too_early' || timing === 'closed') return fail(timing);

    // ② 거리
    if (!input.location) return fail('gps_denied');
    const dist = Math.round(distanceM(input.location.lat, input.location.lng, Number(session.location.latitude), Number(session.location.longitude)));
    const acc = Math.round(input.location.accuracy);
    if (!withinRange(dist, acc, radius)) return fail('out_of_range', dist, acc);

    // ③ 강의실 코드
    if (!verifyRoomCode(session.id, input.code, now.getTime())) return fail('code_wrong', dist, acc);

    // ④ 같은 기기 · ⑤ 등록 기기 — 같은 수업의 출석은 한 번에 하나씩 처리 (동시에 눌러도 순서가 꼬이지 않게)
    const outcome = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(1, ${session.id}::int)`;
      const again = await tx.attendance.findUnique({ where: { studentId_sessionId: { studentId, sessionId: session.id } } });
      if (again) return { result: 'already', attendance: again, canceledOthers: [] as number[], approvalId: null as number | null, ownerName: null as string | null };

      const dev = await tx.device.findUniqueOrThrow({ where: { id: device.id } });
      const owner = await tx.device.findFirst({ where: { fingerprintHash: fp, status: 'active' }, include: { student: true } });
      const iAmOwner = owner?.studentId === studentId;
      const others = await tx.attendance.findMany({
        where: { sessionId: session.id, studentId: { not: studentId }, status: { not: 'canceled' }, device: { fingerprintHash: fp } },
      });

      // ④ 같은 수업에 같은 기기로 다른 학생이 이미 출석함 → 기기 주인은 유지, 주인이 아닌 쪽을 취소
      if (others.length > 0) {
        if (iAmOwner) {
          const mine = await tx.attendance.create({
            data: { studentId, sessionId: session.id, deviceId: dev.id, status: timing, checkedAt: now, decidedAt: now, distanceM: dist, suspicious: true, suspiciousReason: PROXY_REASON_SAME },
          });
          for (const o of others) await this.cancelAsProxy(tx, o.id, o.status, o.studentId);
          await tx.attendanceAttempt.create({ data: { studentId, sessionId: session.id, deviceId: dev.id, result: timing, distanceM: dist, gpsAccuracyM: acc } });
          return { result: timing as string, attendance: mine, canceledOthers: others.map((o) => o.studentId), approvalId: null, ownerName: null };
        }
        const mine = await tx.attendance.create({
          data: { studentId, sessionId: session.id, deviceId: dev.id, status: 'canceled', checkedAt: now, decidedAt: now, distanceM: dist, suspicious: true, suspiciousReason: PROXY_REASON_CANCELED },
        });
        await tx.penalty.create({ data: { studentId, attendanceId: mine.id, kind: 'attendance_cancel', reason: '같은 수업에서 같은 기기로 다른 계정이 출석함', decidedByType: 'system' } });
        await tx.attendance.updateMany({ where: { id: { in: others.map((o) => o.id) } }, data: { suspicious: true, suspiciousReason: PROXY_REASON_SAME } });
        await tx.attendanceAttempt.create({ data: { studentId, sessionId: session.id, deviceId: dev.id, result: 'proxy_canceled', distanceM: dist, gpsAccuracyM: acc } });
        return { result: 'proxy_canceled', attendance: mine, canceledOthers: [studentId], approvalId: null, ownerName: null };
      }

      // ⑤ 등록 기기면 바로 출석·지각
      if (dev.status === 'active') {
        const mine = await tx.attendance.create({
          data: { studentId, sessionId: session.id, deviceId: dev.id, status: timing, checkedAt: now, decidedAt: now, distanceM: dist },
        });
        await tx.attendanceAttempt.create({ data: { studentId, sessionId: session.id, deviceId: dev.id, result: timing, distanceM: dist, gpsAccuracyM: acc } });
        return { result: timing as string, attendance: mine, canceledOthers: [], approvalId: null, ownerName: null };
      }

      // 등록되지 않은 기기 → 인솔자 승인 대기
      const otherOwner = owner && !iAmOwner ? owner : null;
      if (dev.status !== 'pending') await tx.device.update({ where: { id: dev.id }, data: { status: 'pending' } });
      const mine = await tx.attendance.create({
        data: {
          studentId,
          sessionId: session.id,
          deviceId: dev.id,
          status: 'pending_device',
          checkedAt: now,
          distanceM: dist,
          suspicious: !!otherOwner,
          suspiciousReason: otherOwner ? OTHER_OWNER_REASON : '미등록 기기',
        },
      });
      const approval = await tx.deviceApproval.create({ data: { attendanceId: mine.id, deviceId: dev.id } });
      await tx.attendanceAttempt.create({ data: { studentId, sessionId: session.id, deviceId: dev.id, result: 'pending_device', distanceM: dist, gpsAccuracyM: acc } });
      return { result: 'pending_device', attendance: mine, canceledOthers: [], approvalId: approval.id, ownerName: otherOwner?.student.name ?? null };
    });

    // 알림은 저장이 끝난 뒤 보낸다 (실패해도 출석에는 영향 없음)
    void this.afterAttend(studentId, session.course.name, session.period, date, outcome).catch((e) => this.log.warn(`알림 실패: ${String(e)}`));

    const a = outcome.attendance;
    return this.respond(outcome.result, a.status, a.decidedAt, a.distanceM, radius, attendFrom);
  }

  /** 주인이 아닌 계정의 출석을 자동 취소 (+ 수정 이력, 불이익 기록, 승인 대기 정리) */
  private async cancelAsProxy(tx: Tx, attendanceId: number, fromStatus: string, studentId: number) {
    await tx.attendance.update({ where: { id: attendanceId }, data: { status: 'canceled', suspicious: true, suspiciousReason: PROXY_REASON_CANCELED } });
    await tx.attendanceChange.create({
      data: { attendanceId, fromStatus, toStatus: 'canceled', reason: '대리 출석 자동 취소: 기기 주인이 같은 기기로 출석함', changedByType: 'system' },
    });
    await tx.penalty.create({ data: { studentId, attendanceId, kind: 'attendance_cancel', reason: '같은 수업에서 기기 주인이 같은 기기로 출석함', decidedByType: 'system' } });
    await tx.deviceApproval.updateMany({
      where: { attendanceId, status: 'pending' },
      data: { status: 'rejected', decidedByType: 'system', decidedAt: new Date(), rejectReason: '대리 출석 자동 취소' },
    });
  }

  private async afterAttend(
    studentId: number,
    courseName: string,
    period: number,
    date: string,
    o: { result: string; canceledOthers: number[]; approvalId: number | null; ownerName: string | null },
  ) {
    const student = await this.prisma.student.findUniqueOrThrow({ where: { id: studentId } });
    const label = `${date} ${period}교시 ${courseName}`;
    if (o.result === 'pending_device') {
      const extra = o.ownerName ? `\n주의: 이 기기는 다른 학생(${o.ownerName})의 등록 기기예요.` : '';
      await this.mail.notifySchoolStaff(
        student.schoolId,
        'device_approval',
        `기기 승인 요청 · ${student.name}`,
        `${student.name}(${student.studentNo}) 학생이 등록되지 않은 기기로 출석했어요.\n수업: ${label}${extra}\n인솔자 화면의 "기기 승인"에서 승인하거나 거절해 주세요. 승인한 시각을 기준으로 출석·지각이 정해져요.`,
      );
    }
    if (o.canceledOthers.length > 0) {
      const names = await this.prisma.student.findMany({ where: { id: { in: o.canceledOthers } } });
      const body = `같은 수업에서 같은 기기로 두 계정이 출석해 기기 주인이 아닌 계정의 출석을 자동 취소했어요.\n수업: ${label}\n취소: ${names.map((n) => `${n.name}(${n.studentNo})`).join(', ')}\n벌점·수료 불가는 총관리자 화면의 "대리 출석·불이익"에서 정해요.`;
      const schools = new Set([student.schoolId, ...names.map((n) => n.schoolId)]);
      for (const s of schools) await this.mail.notifySchoolStaff(s, 'proxy_attendance', '대리 출석 감지', body);
      await this.mail.notifyAdmins('proxy_attendance', '대리 출석 감지', body);
    }
  }

  private respond(result: string, status: string, decidedAt: Date | null, dist: number | null, radiusM: number, attendFrom: string) {
    let message = RESULT_MESSAGES[result] ?? '';
    if (result === 'out_of_range' && dist !== null) message = `출석 장소에서 약 ${dist}m 떨어져 있어요 (허용 ${radiusM}m). 강의실 안에서 다시 시도해 주세요.`;
    if (result === 'too_early' && attendFrom) message = `아직 출석 시간이 아니에요. ${attendFrom}부터 출석할 수 있어요.`;
    if (result === 'already') message = `이미 처리된 출석이에요 (${STATUS_LABEL[status] ?? status}).`;
    return { result, status, decidedAt: decidedAt?.toISOString() ?? null, distanceM: dist, radiusM, attendFrom, message };
  }

  // ========== 기기 승인 ==========

  /**
   * 기기 승인/거절. 승인 시각으로 출석·지각을 정하고, 수업이 끝난 뒤면 결석.
   * schoolId를 주면 그 학교 학생 건만 처리할 수 있다 (인솔자).
   */
  async decideDevice(approvalId: number, actor: Actor, approve: boolean, reason: string | null, schoolId?: number) {
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const ap = await tx.deviceApproval.findUnique({
        where: { id: approvalId },
        include: { attendance: { include: { session: true, student: true } }, device: true },
      });
      if (!ap) throw Errors.notFound('승인 요청');
      if (schoolId !== undefined && ap.attendance.student.schoolId !== schoolId) throw Errors.forbidden();
      if (ap.status !== 'pending') throw Errors.conflict('ALREADY_DECIDED', '이미 처리된 요청이에요.');
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(1, ${ap.attendance.sessionId}::int)`;
      const att = await tx.attendance.findUniqueOrThrow({ where: { id: ap.attendanceId } });
      if (att.status !== 'pending_device') throw Errors.conflict('ALREADY_DECIDED', '이미 처리된 출석이에요.');

      const s = ap.attendance.session;
      const w = sessionWindow(dateOnly(s.classDate), s.startTime, s.endTime);
      let toStatus: string;
      let message: string;
      if (approve) {
        toStatus = statusAtApproval(now, w);
        // 다른 학생의 등록 기기면 이 학생 기기로 등록하지 않는다 (출석만 인정)
        const ownedByOther = await tx.device.findFirst({ where: { fingerprintHash: ap.device.fingerprintHash, status: 'active', NOT: { studentId: ap.device.studentId } } });
        if (ownedByOther) {
          message = `승인했어요 (${kstHHMM(now)} 기준 ${STATUS_LABEL[toStatus]}). 다른 학생의 등록 기기라서 이 기기는 등록하지 않았어요.`;
        } else {
          await tx.device.updateMany({ where: { studentId: ap.device.studentId, status: 'active' }, data: { status: 'retired', retiredAt: now } });
          await tx.device.update({ where: { id: ap.deviceId }, data: { status: 'active', retiredAt: null } });
          message = `승인했어요. ${kstHHMM(now)} 기준 ${STATUS_LABEL[toStatus]}으로 처리했고, 이 기기를 출석 기기로 등록했어요.`;
        }
      } else {
        toStatus = 'absent';
        if (ap.device.status !== 'active') await tx.device.update({ where: { id: ap.deviceId }, data: { status: 'rejected' } });
        message = '거절했어요. 결석으로 처리했어요.';
      }
      await tx.attendance.update({ where: { id: att.id }, data: { status: toStatus, decidedAt: now } });
      await tx.attendanceChange.create({
        data: {
          attendanceId: att.id,
          fromStatus: 'pending_device',
          toStatus,
          reason: approve ? '기기 승인' : `기기 승인 거절: ${reason ?? ''}`,
          changedByType: actor.type,
          changedById: actor.id,
        },
      });
      await tx.deviceApproval.update({
        where: { id: ap.id },
        data: { status: approve ? 'approved' : 'rejected', decidedByType: actor.type, decidedById: actor.id, decidedAt: now, rejectReason: approve ? null : reason },
      });
      return { status: toStatus, message };
    });
  }
}
