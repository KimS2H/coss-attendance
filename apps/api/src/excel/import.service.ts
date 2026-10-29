// ─────────────────────────────────────────────
// 엑셀 일괄 등록: 템플릿 받기 → 올리기(미리보기: 행별 오류 표시) → 확정
// 종류: students(학생·수강 시트) / staff(인솔자) / locations(장소) / sessions(수업 일정)
// 컬럼 정의: 엑셀 설계서 "엑셀 양식" 시트
// ─────────────────────────────────────────────
import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { Errors } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { dateOnly, isDateStr, isHHMM, toDbDate } from '../common/time';

export type ImportKind = 'students' | 'staff' | 'locations' | 'sessions';
type RowError = { sheet: string; row: number; column: string; message: string };
type Uploader = { type: 'staff' | 'admin'; id: number };

// 템플릿 시트와 컬럼 (* = 필수)
const SHEETS: Record<ImportKind, { name: string; columns: string[]; help: string[][] }[]> = {
  students: [
    {
      name: '학생',
      columns: ['학교', '학번', '이름', '단과대', '학과'],
      help: [['학교', '필수', '등록된 학교명 (예: 한국대). 인솔자는 본인 학교만'], ['학번', '필수', '같은 학교 안에서 중복 불가. 셀 서식을 "텍스트"로'], ['이름', '필수', ''], ['단과대', '필수', '예: 공과대학'], ['학과', '필수', '예: 컴퓨터공학과']],
    },
    {
      name: '수강',
      columns: ['학번', '과목명', '날짜', '교시'],
      help: [['학번', '필수', '"학생" 시트에 있거나 이미 등록된 학생'], ['과목명', '필수', '수업 일정에 등록된 과목'], ['날짜', '선택', 'YYYY-MM-DD. 비우면 그 과목의 모든 회차를 수강'], ['교시', '선택', '날짜를 적었으면 함께']],
    },
  ],
  staff: [
    {
      name: '인솔자',
      columns: ['학교', '직번', '이름', '이메일', '권한'],
      help: [['학교', '필수', '등록된 학교명'], ['직번', '필수', '같은 학교 안에서 중복 불가'], ['이름', '필수', ''], ['이메일', '필수', '기기 승인 요청·문의 알림을 받는 주소'], ['권한', '선택', '보기 또는 수정 (비우면 수정)']],
    },
  ],
  locations: [
    {
      name: '장소',
      columns: ['장소명', '위도', '경도', '허용 반경'],
      help: [['장소명', '필수', '예: 공학관 301. 중복 불가'], ['위도', '필수', '예: 37.123456 (지도 앱에서 건물을 길게 눌러 복사)'], ['경도', '필수', '예: 127.123456'], ['허용 반경', '선택', '미터. 비우면 50']],
    },
  ],
  sessions: [
    {
      name: '수업 일정',
      columns: ['과목명', '날짜', '교시', '시작 시각', '종료 시각', '장소명'],
      help: [['과목명', '필수', '처음 나오는 과목은 자동 등록'], ['날짜', '필수', 'YYYY-MM-DD'], ['교시', '필수', '숫자. 과목·날짜·교시 조합은 중복 불가'], ['시작 시각', '필수', 'HH:MM (예: 10:00)'], ['종료 시각', '필수', 'HH:MM. 시작보다 늦게'], ['장소명', '필수', '"장소"에 먼저 등록된 이름']],
    },
  ],
};

@Injectable()
export class ImportService {
  constructor(private prisma: PrismaService) {}

  // ---------- 템플릿 ----------
  async template(kind: ImportKind): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    for (const sh of SHEETS[kind]) {
      const ws = wb.addWorksheet(sh.name);
      ws.addRow(sh.columns);
      ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
      sh.columns.forEach((_, i) => {
        ws.getColumn(i + 1).width = 18;
        ws.getColumn(i + 1).numFmt = '@'; // 모두 텍스트로 (학번 앞자리 0 유지)
      });
    }
    const help = wb.addWorksheet('작성 방법');
    help.addRow(['시트', '컬럼', '필수', '설명']);
    help.getRow(1).font = { bold: true };
    for (const sh of SHEETS[kind]) for (const [c, req, d] of sh.help) help.addRow([sh.name, c, req, d]);
    help.addRow([]);
    help.addRow(['', '첫 줄(제목 줄)은 지우지 마세요. 둘째 줄부터 한 줄에 하나씩 적어요.']);
    help.columns.forEach((c, i) => (c.width = [12, 14, 8, 60][i]));
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  // ---------- 미리보기 ----------
  async preview(kind: ImportKind, file: { buffer: Buffer; originalname: string }, by: Uploader, schoolId: number | null) {
    if (kind === 'students' && !schoolId) throw Errors.validation('학교를 선택해 주세요.');
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(file.buffer as unknown as ArrayBuffer);
    } catch {
      throw Errors.validation('엑셀 파일(.xlsx)을 읽지 못했어요. 템플릿으로 다시 만들어 주세요.');
    }
    const sheets: Record<string, Row[]> = {};
    const errors: RowError[] = [];
    for (const sh of SHEETS[kind]) {
      const ws = wb.getWorksheet(sh.name);
      if (!ws) {
        if (kind === 'students' && sh.name === '수강') {
          sheets[sh.name] = [];
          continue;
        }
        throw Errors.validation(`"${sh.name}" 시트가 없어요. 템플릿을 받아 그 안에 적어 주세요.`);
      }
      sheets[sh.name] = readSheet(ws, sh.columns, errors);
    }

    let result: { payload: unknown; counts: { create: number; update: number; skip: number } };
    if (kind === 'students') result = await this.checkStudents(sheets['학생'], sheets['수강'], schoolId!, errors);
    else if (kind === 'staff') result = await this.checkStaff(sheets['인솔자'], errors);
    else if (kind === 'locations') result = await this.checkLocations(sheets['장소'], errors);
    else result = await this.checkSessions(sheets['수업 일정'], errors);

    const job = await this.prisma.importJob.create({
      data: {
        schoolId: kind === 'students' ? schoolId : null,
        kind,
        uploadedByType: by.type,
        uploadedById: by.id,
        fileName: file.originalname.slice(0, 200),
        status: 'preview',
        errors: errors as object,
        payload: result.payload as object,
      },
    });
    const first = Object.values(sheets)[0] ?? [];
    return {
      jobId: job.id,
      kind,
      fileName: job.fileName,
      counts: { ...result.counts, error: errors.length },
      errors: errors.slice(0, 300),
      sample: first.slice(0, 10).map(({ _row, ...r }) => r),
    };
  }

  // ---------- 확정 ----------
  async confirm(jobId: number, mode: 'update' | 'skip', by: Uploader, schoolId?: number) {
    const job = await this.prisma.importJob.findUnique({ where: { id: jobId } });
    if (!job || job.uploadedByType !== by.type || (by.type === 'staff' && job.uploadedById !== by.id)) throw Errors.notFound('등록 작업');
    if (schoolId !== undefined && job.schoolId !== schoolId) throw Errors.forbidden();
    if (job.status !== 'preview') throw Errors.conflict('ALREADY_CONFIRMED', '이미 확정했거나 실패한 작업이에요. 파일을 다시 올려 주세요.');
    if (Array.isArray(job.errors) && job.errors.length > 0) throw Errors.validation('오류가 있는 행을 고친 뒤 다시 올려 주세요.');
    const p = job.payload as any;
    let r = { created: 0, updated: 0, skipped: 0 };
    await this.prisma.$transaction(
      async (tx) => {
        if (job.kind === 'students') {
          for (const s of p.students as any[]) {
            const ex = await tx.student.findUnique({ where: { schoolId_studentNo: { schoolId: job.schoolId!, studentNo: s.studentNo } } });
            if (!ex) {
              await tx.student.create({ data: { schoolId: job.schoolId!, studentNo: s.studentNo, name: s.name, college: s.college, department: s.department } });
              r.created++;
            } else if (mode === 'update') {
              await tx.student.update({ where: { id: ex.id }, data: { name: s.name, college: s.college, department: s.department, isActive: true } });
              r.updated++;
            } else r.skipped++;
          }
          for (const e of p.enrollments as any[]) {
            const st = await tx.student.findUnique({ where: { schoolId_studentNo: { schoolId: job.schoolId!, studentNo: e.studentNo } } });
            if (!st) continue;
            const res = await tx.enrollment.createMany({ data: (e.sessionIds as number[]).map((sessionId) => ({ studentId: st.id, sessionId })), skipDuplicates: true });
            r.created += res.count;
          }
        } else if (job.kind === 'staff') {
          for (const s of p.staff as any[]) {
            const ex = await tx.staff.findUnique({ where: { schoolId_staffNo: { schoolId: s.schoolId, staffNo: s.staffNo } } });
            if (!ex) {
              await tx.staff.create({ data: s });
              r.created++;
            } else if (mode === 'update') {
              await tx.staff.update({ where: { id: ex.id }, data: { name: s.name, email: s.email, permission: s.permission, isActive: true } });
              r.updated++;
            } else r.skipped++;
          }
        } else if (job.kind === 'locations') {
          for (const l of p.locations as any[]) {
            const ex = await tx.location.findUnique({ where: { name: l.name } });
            if (!ex) {
              await tx.location.create({ data: l });
              r.created++;
            } else if (mode === 'update') {
              await tx.location.update({ where: { id: ex.id }, data: l });
              r.updated++;
            } else r.skipped++;
          }
        } else {
          for (const s of p.sessions as any[]) {
            const course = await tx.course.upsert({ where: { name: s.courseName }, create: { name: s.courseName }, update: {} });
            const loc = await tx.location.findUniqueOrThrow({ where: { name: s.locationName } });
            const key = { courseId_classDate_period: { courseId: course.id, classDate: toDbDate(s.date), period: s.period } };
            const ex = await tx.session.findUnique({ where: key });
            const data = { startTime: s.startTime, endTime: s.endTime, locationId: loc.id };
            if (!ex) {
              await tx.session.create({ data: { courseId: course.id, classDate: toDbDate(s.date), period: s.period, ...data } });
              r.created++;
            } else if (mode === 'update') {
              await tx.session.update({ where: { id: ex.id }, data });
              r.updated++;
            } else r.skipped++;
          }
        }
      },
      { timeout: 60_000 },
    );
    await this.prisma.importJob.update({
      where: { id: jobId },
      data: { status: 'confirmed', createdCount: r.created, updatedCount: r.updated, skippedCount: r.skipped, payload: undefined },
    });
    return r;
  }

  // ---------- 종류별 검사 ----------
  private async checkStudents(rows: Row[], enrollRows: Row[], schoolId: number, errors: RowError[]) {
    const school = await this.prisma.school.findUniqueOrThrow({ where: { id: schoolId } });
    const seen = new Set<string>();
    const students: { studentNo: string; name: string; college: string; department: string }[] = [];
    for (const r of rows) {
      const e = (column: string, message: string) => errors.push({ sheet: '학생', row: r._row, column, message });
      if (r['학교'] && r['학교'] !== school.name) e('학교', `선택한 학교(${school.name})와 달라요`);
      for (const c of ['학번', '이름', '단과대', '학과']) if (!r[c]) e(c, '비어 있어요');
      if (r['학번'] && seen.has(r['학번'])) e('학번', '파일 안에서 중복돼요');
      if (r['학번']) seen.add(r['학번']);
      students.push({ studentNo: r['학번'], name: r['이름'], college: r['단과대'], department: r['학과'] });
    }
    const existing = await this.prisma.student.findMany({ where: { schoolId, studentNo: { in: students.map((s) => s.studentNo) } }, select: { studentNo: true } });
    const existingSet = new Set(existing.map((s) => s.studentNo));
    const allNos = new Set([...seen, ...(await this.prisma.student.findMany({ where: { schoolId }, select: { studentNo: true } })).map((s) => s.studentNo)]);

    const enrollments: { studentNo: string; sessionIds: number[] }[] = [];
    let enrollCount = 0;
    const sessionsByCourse = new Map<string, { id: number; date: string; period: number }[]>();
    for (const s of await this.prisma.session.findMany({ include: { course: true } })) {
      const list = sessionsByCourse.get(s.course.name) ?? [];
      list.push({ id: s.id, date: dateOnly(s.classDate), period: s.period });
      sessionsByCourse.set(s.course.name, list);
    }
    for (const r of enrollRows) {
      const e = (column: string, message: string) => errors.push({ sheet: '수강', row: r._row, column, message });
      if (!r['학번']) e('학번', '비어 있어요');
      else if (!allNos.has(r['학번'])) e('학번', '학생 시트나 등록된 학생에 없어요');
      const list = sessionsByCourse.get(r['과목명']);
      if (!r['과목명']) e('과목명', '비어 있어요');
      else if (!list) e('과목명', '수업 일정에 없는 과목이에요 (총관리자가 먼저 등록)');
      let ids: number[] = [];
      if (list) {
        if (r['날짜'] || r['교시']) {
          if (!isDateStr(r['날짜'])) e('날짜', 'YYYY-MM-DD 형식으로 적어 주세요');
          const hit = list.find((s) => s.date === r['날짜'] && String(s.period) === r['교시']);
          if (isDateStr(r['날짜']) && !hit) e('교시', '그 날짜·교시의 수업이 없어요');
          if (hit) ids = [hit.id];
        } else ids = list.map((s) => s.id);
      }
      enrollments.push({ studentNo: r['학번'], sessionIds: ids });
      enrollCount += ids.length;
    }
    const create = students.filter((s) => !existingSet.has(s.studentNo)).length;
    return { payload: { students, enrollments }, counts: { create: create + enrollCount, update: students.length - create, skip: 0 } };
  }

  private async checkStaff(rows: Row[], errors: RowError[]) {
    const schools = new Map((await this.prisma.school.findMany()).map((s) => [s.name, s.id]));
    const seen = new Set<string>();
    const staff: { schoolId: number; staffNo: string; name: string; email: string; permission: string }[] = [];
    for (const r of rows) {
      const e = (column: string, message: string) => errors.push({ sheet: '인솔자', row: r._row, column, message });
      const schoolId = schools.get(r['학교']);
      if (!r['학교']) e('학교', '비어 있어요');
      else if (!schoolId) e('학교', '등록되지 않은 학교예요 (계정·학교 코드 화면에서 먼저 등록)');
      for (const c of ['직번', '이름', '이메일']) if (!r[c]) e(c, '비어 있어요');
      if (r['이메일'] && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r['이메일'])) e('이메일', '이메일 형식이 아니에요');
      const perm = r['권한'] === '보기' ? 'view' : r['권한'] === '' || r['권한'] === '수정' ? 'edit' : null;
      if (!perm) e('권한', '"보기" 또는 "수정"으로 적어 주세요');
      const key = `${r['학교']}:${r['직번']}`;
      if (seen.has(key)) e('직번', '파일 안에서 중복돼요');
      seen.add(key);
      if (schoolId) staff.push({ schoolId, staffNo: r['직번'], name: r['이름'], email: r['이메일'], permission: perm ?? 'edit' });
    }
    const existing = await this.prisma.staff.findMany({ where: { OR: staff.map((s) => ({ schoolId: s.schoolId, staffNo: s.staffNo })) } });
    return { payload: { staff }, counts: { create: staff.length - existing.length, update: existing.length, skip: 0 } };
  }

  private async checkLocations(rows: Row[], errors: RowError[]) {
    const seen = new Set<string>();
    const locations: { name: string; latitude: number; longitude: number; radiusM: number }[] = [];
    for (const r of rows) {
      const e = (column: string, message: string) => errors.push({ sheet: '장소', row: r._row, column, message });
      if (!r['장소명']) e('장소명', '비어 있어요');
      if (seen.has(r['장소명'])) e('장소명', '파일 안에서 중복돼요');
      seen.add(r['장소명']);
      const lat = Number(r['위도']);
      const lng = Number(r['경도']);
      const radius = r['허용 반경'] ? Number(r['허용 반경']) : 50;
      if (!r['위도'] || !Number.isFinite(lat) || lat < 33 || lat > 39) e('위도', '한국 안의 위도(33~39)를 숫자로 적어 주세요');
      if (!r['경도'] || !Number.isFinite(lng) || lng < 124 || lng > 132) e('경도', '한국 안의 경도(124~132)를 숫자로 적어 주세요');
      if (!Number.isInteger(radius) || radius < 10 || radius > 1000) e('허용 반경', '10~1000 사이 정수(m)로 적어 주세요');
      locations.push({ name: r['장소명'], latitude: lat, longitude: lng, radiusM: radius });
    }
    const existing = await this.prisma.location.count({ where: { name: { in: locations.map((l) => l.name) } } });
    return { payload: { locations }, counts: { create: locations.length - existing, update: existing, skip: 0 } };
  }

  private async checkSessions(rows: Row[], errors: RowError[]) {
    const locNames = new Set((await this.prisma.location.findMany({ select: { name: true } })).map((l) => l.name));
    const seen = new Set<string>();
    const sessions: { courseName: string; date: string; period: number; startTime: string; endTime: string; locationName: string }[] = [];
    for (const r of rows) {
      const e = (column: string, message: string) => errors.push({ sheet: '수업 일정', row: r._row, column, message });
      if (!r['과목명']) e('과목명', '비어 있어요');
      if (!isDateStr(r['날짜'])) e('날짜', 'YYYY-MM-DD 형식으로 적어 주세요');
      const period = Number(r['교시']);
      if (!Number.isInteger(period) || period < 0 || period > 20) e('교시', '숫자로 적어 주세요');
      const st = normalizeTime(r['시작 시각']);
      const et = normalizeTime(r['종료 시각']);
      if (!isHHMM(st)) e('시작 시각', 'HH:MM 형식으로 적어 주세요 (예: 10:00)');
      if (!isHHMM(et)) e('종료 시각', 'HH:MM 형식으로 적어 주세요 (예: 11:50)');
      if (isHHMM(st) && isHHMM(et) && et <= st) e('종료 시각', '시작 시각보다 늦어야 해요');
      if (!r['장소명']) e('장소명', '비어 있어요');
      else if (!locNames.has(r['장소명'])) e('장소명', '등록되지 않은 장소예요 (장소를 먼저 올려 주세요)');
      const key = `${r['과목명']}:${r['날짜']}:${period}`;
      if (seen.has(key)) e('교시', '같은 과목·날짜·교시가 파일 안에 두 번 있어요');
      seen.add(key);
      sessions.push({ courseName: r['과목명'], date: r['날짜'], period, startTime: st, endTime: et, locationName: r['장소명'] });
    }
    let existing = 0;
    for (const s of sessions) {
      const c = await this.prisma.session.count({ where: { course: { name: s.courseName }, classDate: isDateStr(s.date) ? toDbDate(s.date) : undefined, period: s.period } });
      if (c > 0 && isDateStr(s.date)) existing++;
    }
    return { payload: { sessions }, counts: { create: sessions.length - existing, update: existing, skip: 0 } };
  }
}

// ---------- 엑셀 셀 읽기 ----------
type Row = Record<string, string> & { _row: number };

function readSheet(ws: ExcelJS.Worksheet, columns: string[], errors: RowError[]): Row[] {
  const header = ws.getRow(1);
  const idx = new Map<string, number>();
  header.eachCell((cell, col) => idx.set(cellText(cell.value).trim(), col));
  for (const c of columns) if (!idx.has(c)) errors.push({ sheet: ws.name, row: 1, column: c, message: '제목 줄에 이 컬럼이 없어요' });
  const rows: Row[] = [];
  for (let i = 2; i <= ws.rowCount; i++) {
    const r = ws.getRow(i);
    const obj: Row = { _row: i } as Row;
    let any = false;
    for (const c of columns) {
      const col = idx.get(c);
      const v = col ? cellText(r.getCell(col).value, c).trim() : '';
      if (v) any = true;
      obj[c] = v;
    }
    if (any) rows.push(obj);
  }
  return rows;
}

function cellText(v: ExcelJS.CellValue, column = ''): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) {
    // 엑셀 날짜·시각 칸: 시각 컬럼이면 HH:MM, 아니면 YYYY-MM-DD
    const iso = v.toISOString();
    return column.includes('시각') ? iso.slice(11, 16) : iso.slice(0, 10);
  }
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map((t) => t.text).join('');
    if ('result' in v) return cellText(v.result as ExcelJS.CellValue, column);
    if ('text' in v) return String(v.text);
    return '';
  }
  if (typeof v === 'number' && column.includes('시각') && v < 1) {
    // 엑셀이 시각을 하루의 비율(0.4166 = 10:00)로 저장한 경우
    const min = Math.round(v * 24 * 60);
    return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
  }
  return String(v);
}

/** "9:00" → "09:00" */
function normalizeTime(s: string): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(s ?? '');
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : s;
}
