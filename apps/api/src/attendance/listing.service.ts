// 출석 현황 표와 다운로드 (인솔자: 담당 학교만, 총관리자: 전체)
import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { PrismaService } from '../common/prisma.service';
import { dateOnly, kstHHMM, kstToday, toDbDate } from '../common/time';
import { STATUS_LABEL } from './rules';

export type ListFilter = { date?: string; sessionId?: number; schoolId?: number; status?: string; q?: string };

@Injectable()
export class ListingService {
  constructor(private prisma: PrismaService) {}

  /** 그날 수업 목록 + (학교를 주면 그 학교 학생 기준) 수강·출석 인원 */
  async sessionsOn(date: string, schoolId?: number) {
    const sessions = await this.prisma.session.findMany({
      where: { classDate: toDbDate(date) },
      include: {
        course: true,
        location: true,
        enrollments: { where: schoolId ? { student: { schoolId } } : {}, select: { studentId: true } },
        attendances: { where: { status: { in: ['present', 'late'] }, ...(schoolId ? { student: { schoolId } } : {}) }, select: { id: true } },
      },
      orderBy: [{ startTime: 'asc' }, { period: 'asc' }],
    });
    return sessions
      .filter((s) => !schoolId || s.enrollments.length > 0)
      .map((s) => ({
        id: s.id,
        date: dateOnly(s.classDate),
        period: s.period,
        courseName: s.course.name,
        locationName: s.location.name,
        startTime: s.startTime,
        endTime: s.endTime,
        enrolled: s.enrollments.length,
        attended: s.attendances.length,
      }));
  }

  async rows(f: ListFilter) {
    const date = f.date ?? kstToday();
    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        ...(f.sessionId ? { sessionId: f.sessionId } : { session: { classDate: toDbDate(date) } }),
        student: {
          ...(f.schoolId ? { schoolId: f.schoolId } : {}),
          ...(f.q ? { OR: [{ name: { contains: f.q } }, { studentNo: { contains: f.q } }] } : {}),
        },
      },
      include: { student: { include: { school: true } }, session: { include: { course: true } } },
    });
    const keys = enrollments.map((e) => ({ studentId: e.studentId, sessionId: e.sessionId }));
    const atts = keys.length
      ? await this.prisma.attendance.findMany({
          where: { OR: keys },
          include: { changeRequests: { where: { status: { in: ['pending', 'auto_rejected'] } }, select: { id: true } }, changes: { orderBy: { id: 'desc' }, take: 1 } },
        })
      : [];
    const byKey = new Map(atts.map((a) => [`${a.studentId}:${a.sessionId}`, a]));

    let rows = enrollments.map((e) => {
      const a = byKey.get(`${e.studentId}:${e.sessionId}`);
      const status = a?.status ?? 'none';
      return {
        attendanceId: a?.id ?? null,
        studentId: e.studentId,
        studentNo: e.student.studentNo,
        name: e.student.name,
        schoolName: e.student.school.name,
        department: e.student.department,
        sessionId: e.sessionId,
        date: dateOnly(e.session.classDate),
        period: e.session.period,
        courseName: e.session.course.name,
        startTime: e.session.startTime,
        status,
        checkedAt: a?.checkedAt?.toISOString() ?? null,
        decidedAt: a?.decidedAt?.toISOString() ?? null,
        distanceM: a?.distanceM ?? null,
        locationText: a?.distanceM == null ? '-' : `반경 내 (${a.distanceM}m)`,
        suspicious: a?.suspicious ?? false,
        suspiciousReason: a?.suspiciousReason ?? null,
        pendingChangeRequest: (a?.changeRequests.length ?? 0) > 0,
        lastChangeReason: a?.changes[0]?.reason ?? null,
      };
    });
    rows.sort((x, y) => x.startTime.localeCompare(y.startTime) || x.period - y.period || x.schoolName.localeCompare(y.schoolName) || x.studentNo.localeCompare(y.studentNo));

    const summary = {
      total: rows.length,
      present: rows.filter((r) => r.status === 'present').length,
      late: rows.filter((r) => r.status === 'late').length,
      absent: rows.filter((r) => r.status === 'absent' || r.status === 'canceled').length,
      none: rows.filter((r) => r.status === 'none').length,
      pending: rows.filter((r) => r.status === 'pending_device').length,
      suspicious: rows.filter((r) => r.suspicious).length,
    };
    // 상태 필터. "suspicious"는 동일기기 의심 건만, "absent"는 출석 취소(대리 출석)도 포함
    if (f.status === 'suspicious') rows = rows.filter((r) => r.suspicious);
    else if (f.status === 'absent') rows = rows.filter((r) => r.status === 'absent' || r.status === 'canceled');
    else if (f.status) rows = rows.filter((r) => r.status === f.status);
    return { rows: rows.map(({ startTime: _s, lastChangeReason: _l, ...r }) => r), summary, _full: rows };
  }

  /** 다운로드: 엑셀 설계서 "엑셀 양식" ⑥ 컬럼 순서 */
  async export(f: ListFilter, format: 'xlsx' | 'csv'): Promise<{ buffer: Buffer; fileName: string; contentType: string }> {
    const { _full } = await this.rows(f);
    const head = ['학번', '이름', '위치', '날짜', '참가여부', '동일기기 의심여부', '학교', '교시', '과목명', '출석 시각', '수정 사유'];
    const data = _full.map((r) => [
      r.studentNo,
      r.name,
      r.locationText,
      r.date,
      STATUS_LABEL[r.status] ?? r.status,
      r.suspicious ? `Y (${r.suspiciousReason ?? ''})` : 'N',
      r.schoolName,
      r.period,
      r.courseName,
      r.checkedAt ? kstHHMM(new Date(r.checkedAt)) : '',
      r.lastChangeReason ?? '',
    ]);
    const base = `출석_${f.date ?? kstToday()}`;
    if (format === 'csv') {
      const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const csv = [head, ...data].map((row) => row.map(esc).join(',')).join('\r\n');
      // 엑셀에서 한글이 깨지지 않도록 BOM을 붙인다
      return { buffer: Buffer.from('﻿' + csv, 'utf8'), fileName: `${base}.csv`, contentType: 'text/csv; charset=utf-8' };
    }
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('출석');
    ws.addRow(head);
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
    data.forEach((d) => ws.addRow(d));
    ws.columns.forEach((c, i) => (c.width = [12, 10, 16, 12, 10, 22, 10, 6, 16, 10, 24][i]));
    ws.getColumn(1).numFmt = '@';
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    return { buffer, fileName: `${base}.xlsx`, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
  }
}
