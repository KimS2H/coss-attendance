// 실제 DB로 전체 흐름 테스트: 첫 설정(계정·이메일) → 관리자 등록 → 학생 출석 → 대리 출석(기기 주인 유지) → 기기 승인 → 출결 변경(10분 우선 거절)
process.env.NODE_ENV = 'test';
process.env.APP_SECRET = 'test-secret-test-secret-test-secret-1234';
process.env.REDIS_URL = '';

import type { INestApplication } from '@nestjs/common';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { roomCodeAt } from '../src/attendance/rules';
import { ChangeRequestsService } from '../src/attendance/change-requests.service';
import { PrismaService } from '../src/common/prisma.service';
import { createApp } from '../src/main';
import { MailService } from '../src/mail/mail.service';

/** 쿠키를 직접 들고 다니는 간단한 브라우저 흉내 (같은 기기 = 같은 did 쿠키) */
class Browser {
  cookies: Record<string, string> = {};
  /** 지금 보고 있는 화면 구역 (실제 화면은 api/client.ts 가 X-Coss-Area 로 보냄). 비우면 안 보냄 */
  area = '';
  constructor(private app: INestApplication) {}
  private store(res: request.Response) {
    const set = res.headers['set-cookie'] as unknown as string[] | undefined;
    for (const c of set ?? []) {
      const [pair] = c.split(';');
      const [k, v] = pair.split('=');
      if (v === '' || /Expires=Thu, 01 Jan 1970/.test(c)) delete this.cookies[k];
      else this.cookies[k] = v;
    }
    return res;
  }
  private header() {
    return Object.entries(this.cookies).map(([k, v]) => `${k}=${v}`).join('; ');
  }
  private headers(): Record<string, string> {
    return this.area ? { Cookie: this.header(), 'X-Coss-Area': this.area } : { Cookie: this.header() };
  }
  async get(url: string) {
    return this.store(await request(this.app.getHttpServer()).get(url).set(this.headers()));
  }
  async post(url: string, body: object = {}) {
    return this.store(await request(this.app.getHttpServer()).post(url).set(this.headers()).send(body));
  }
  async put(url: string, body: object = {}) {
    return this.store(await request(this.app.getHttpServer()).put(url).set(this.headers()).send(body));
  }
  /** 같은 폰에서 다른 사람이 로그인: did는 유지, 로그인 세션만 비움 */
  sameDeviceNewUser() {
    const b = new Browser(this.app);
    if (this.cookies.did) b.cookies.did = this.cookies.did;
    return b;
  }
}

const kstNow = () => new Date(Date.now() + 9 * 3600 * 1000);
const hhmm = (d: Date) => d.toISOString().slice(11, 16);
const LAT = 37.5663;
const LNG = 126.9779;

describe('출석 전체 흐름', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: Browser;
  let schoolId: number;
  let locationId: number;
  let hong: Browser; // 홍길동의 폰 (첫 로그인 기기)
  const today = kstNow().toISOString().slice(0, 10);

  async function newSession(courseName: string, period: number, startOffsetMin = -2) {
    const start = new Date(kstNow().getTime() + startOffsetMin * 60000);
    const end = new Date(Math.min(kstNow().getTime() + 60 * 60000, new Date(`${today}T23:59:00.000Z`).getTime()));
    const r = await admin.post('/api/admin/sessions', { courseName, date: today, period, startTime: hhmm(start), endTime: hhmm(end), locationId });
    expect(r.status).toBe(201);
    return r.body.id as number;
  }
  async function student(no: string, name: string, browser?: Browser) {
    await prisma.student.upsert({ where: { schoolId_studentNo: { schoolId, studentNo: no } }, create: { schoolId, studentNo: no, name, college: '공과대학', department: '컴퓨터공학과' }, update: {} });
    const b = browser ?? new Browser(app);
    await b.get('/api/health'); // did 쿠키 받기
    const r = await b.post('/api/auth/student/login', { schoolId, studentNo: no, name });
    expect(r.status).toBe(201);
    return { b, login: r.body };
  }
  async function enrollAll() {
    const sessions = await prisma.session.findMany();
    const students = await prisma.student.findMany();
    await prisma.enrollment.createMany({ data: students.flatMap((s) => sessions.map((x) => ({ studentId: s.id, sessionId: x.id }))), skipDuplicates: true });
  }
  const attend = (b: Browser, sessionId: number, code = roomCodeAt(sessionId).code, location: object | null = { lat: LAT, lng: LNG, accuracy: 10 }) =>
    b.post('/api/student/attendance', { sessionId, code, location });

  beforeAll(async () => {
    app = await createApp();
    await app.init();
    prisma = app.get(PrismaService);
    // 테스트에서는 실제 메일을 보내지 않는다
    const mail = app.get(MailService);
    jest.spyOn(mail, 'testSmtp').mockResolvedValue(undefined);
    jest.spyOn(mail, 'flush').mockResolvedValue(0);
  });
  afterAll(async () => {
    await app.close();
  });

  it('첫 설정: 계정 → 이메일 → 완료, 그 뒤 관리자 로그인 (OTP 없음)', async () => {
    admin = new Browser(app);
    expect((await admin.get('/api/admin/setup/status')).body).toEqual({ completed: false, step: 'account' });
    expect((await admin.post('/api/admin/setup/account', { username: 'admin', password: 'short' })).status).toBe(400);
    // 첫 설정을 끝내기 전에는 계정을 다시 만들 수 있다 (비밀번호를 잊은 경우)
    expect((await admin.post('/api/admin/setup/account', { username: 'admin', password: 'forgotten-password-1' })).status).toBe(204);
    expect((await admin.post('/api/admin/setup/account', { username: 'admin', password: 'very-long-password-1' })).status).toBe(204);
    expect((await admin.get('/api/admin/setup/status')).body).toEqual({ completed: false, step: 'smtp' });
    expect((await admin.post('/api/admin/setup/smtp', { host: 'smtp.example.com', port: 587, secure: false, user: 'a@example.com', password: 'app-pass', fromName: '출석체크', testTo: 'me@example.com' })).status).toBe(204);
    expect((await admin.post('/api/admin/setup/complete')).status).toBe(204);
    expect((await admin.post('/api/admin/setup/account', { username: 'x2345', password: 'very-long-password-1' })).status).toBe(409);

    expect((await admin.post('/api/admin/auth/login', { username: 'admin', password: 'wrong-password!!' })).status).toBe(401);
    const login = await admin.post('/api/admin/auth/login', { username: 'admin', password: 'very-long-password-1' });
    expect(login.status).toBe(201);
    expect((await admin.get('/api/me')).body.role).toBe('admin');
    const smtp = await admin.get('/api/admin/settings/smtp');
    expect(smtp.body).toMatchObject({ host: 'smtp.example.com', passwordSet: true });
    expect(JSON.stringify(smtp.body)).not.toContain('app-pass');
  });

  it('총관리자: 학교·학교 코드·인솔자·장소 등록', async () => {
    const s = await admin.post('/api/admin/schools', { name: '한국대' });
    schoolId = s.body.id;
    expect((await admin.put(`/api/admin/schools/${schoolId}/code`, { code: '1234' })).body.codeSet).toBe(true);
    expect((await admin.post('/api/admin/staff', { schoolId, staffNo: 'S1', name: '김담당', email: 'kim@example.com', permission: 'edit' })).status).toBe(201);
    const loc = await admin.post('/api/admin/locations', { name: '공학관 301', latitude: LAT, longitude: LNG, radiusM: 50 });
    locationId = loc.body.id;
    expect((await request(app.getHttpServer()).get('/api/schools')).body).toEqual([{ id: schoolId, name: '한국대' }]);
  });

  it('인솔자: 직번·이름 로그인 → 학교 코드 2차 인증', async () => {
    const t = new Browser(app);
    expect((await t.post('/api/auth/staff/login', { schoolId, staffNo: 'S1', name: '틀린이름' })).status).toBe(401);
    expect((await t.post('/api/auth/staff/login', { schoolId, staffNo: 'S1', name: '김담당' })).body).toEqual({ next: 'school_code' });
    expect((await t.get('/api/staff/sessions')).status).toBe(403); // 2차 인증 전에는 못 씀
    expect((await t.post('/api/auth/staff/verify', { schoolCode: '9999' })).body.error.code).toBe('SCHOOL_CODE_FAILED');
    const ok = await t.post('/api/auth/staff/verify', { schoolCode: '1234' });
    expect(ok.body.staff).toMatchObject({ name: '김담당', schoolName: '한국대', permission: 'edit' });
  });

  it('학생: 첫 로그인 기기 등록 → 판정 ① 시간 ② 거리 ③ 코드 → 출석', async () => {
    const s1 = await newSession('AI 기초', 1);
    const { b, login } = await student('20231234', '홍길동');
    hong = b;
    await enrollAll();
    expect(login.device).toBe('newly_registered');
    expect(login.needsConsent).toBe(true);
    expect((await b.post('/api/student/consents', { privacy: true, location: true })).status).toBe(204);
    expect((await b.get('/api/me')).body.needsConsent).toBe(false);

    const today = await b.get('/api/student/today');
    expect(today.body.currentSessionId).toBe(s1);
    expect(today.body.sessions[0]).toMatchObject({ courseName: 'AI 기초', status: 'none' });

    expect((await attend(b, s1, '0000' === roomCodeAt(s1).code ? '0001' : '0000')).body.result).toBe('code_wrong');
    const far = await attend(b, s1, undefined, { lat: LAT + 0.01, lng: LNG, accuracy: 10 });
    expect(far.body).toMatchObject({ result: 'out_of_range', radiusM: 50 });
    expect((await attend(b, s1, undefined, null)).body.result).toBe('gps_denied');
    const ok = await attend(b, s1);
    expect(ok.body).toMatchObject({ result: 'present', status: 'present' });
    expect((await attend(b, s1)).body.result).toBe('already');
    expect(await prisma.attendanceAttempt.count({ where: { sessionId: s1 } })).toBe(4); // 실패 3 + 성공 1
  });

  it('대리 출석 ①: 기기 주인이 먼저 출석 → 같은 기기로 출석한 다른 계정은 자동 취소', async () => {
    const s1 = (await prisma.session.findFirstOrThrow({ where: { course: { name: 'AI 기초' } } })).id;
    const other = await student('20231235', '김하늘', hong.sameDeviceNewUser());
    await enrollAll();
    expect(other.login.device).toBe('unregistered'); // 다른 학생의 등록 기기라 등록하지 않음
    const r = await attend(other.b, s1);
    expect(r.body).toMatchObject({ result: 'proxy_canceled', status: 'canceled' });
    const ownerAtt = await prisma.attendance.findFirstOrThrow({ where: { sessionId: s1, student: { studentNo: '20231234' } } });
    expect(ownerAtt).toMatchObject({ status: 'present', suspicious: true });
    expect(await prisma.penalty.count({ where: { kind: 'attendance_cancel' } })).toBe(1);
  });

  it('대리 출석 ②: 다른 계정이 먼저 출석(승인 대기)해도 기기 주인이 출석하면 다른 계정이 취소됨', async () => {
    const s2 = await newSession('데이터 분석', 2);
    const owner = await student('20229999', '박하은'); // 이 기기의 주인
    const other = await student('20228888', '최도윤', owner.b.sameDeviceNewUser());
    await enrollAll();
    const first = await attend(other.b, s2);
    expect(first.body.result).toBe('pending_device');
    const pending = await prisma.deviceApproval.count({ where: { status: 'pending' } });
    expect(pending).toBe(1);

    const second = await attend(owner.b, s2);
    expect(second.body.result).toBe('present');
    const otherAtt = await prisma.attendance.findFirstOrThrow({ where: { sessionId: s2, student: { studentNo: '20228888' } } });
    expect(otherAtt.status).toBe('canceled');
    expect(await prisma.deviceApproval.count({ where: { status: 'pending' } })).toBe(0); // 승인 대기도 자동 정리
    expect(await prisma.attendanceChange.count({ where: { attendanceId: otherAtt.id, changedByType: 'system' } })).toBe(1);
  });

  it('기기 승인: 새 폰으로 출석 → 승인 대기 → 인솔자 승인 시각 기준 출석, 새 폰이 등록 기기로', async () => {
    const s3 = await newSession('창의 설계', 3);
    const oldPhone = await student('20230007', '정민재');
    const newPhone = await student('20230007', '정민재', new Browser(app));
    await enrollAll();
    expect(oldPhone.login.device).toBe('newly_registered');
    expect(newPhone.login.device).toBe('unregistered');
    expect((await attend(newPhone.b, s3)).body.result).toBe('pending_device');

    const t = new Browser(app);
    await t.post('/api/auth/staff/login', { schoolId, staffNo: 'S1', name: '김담당' });
    await t.post('/api/auth/staff/verify', { schoolCode: '1234' });
    const list = await t.get('/api/staff/device-approvals?status=pending');
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({ studentName: '정민재', ownerName: null });
    const ok = await t.post(`/api/staff/device-approvals/${list.body[0].id}/approve`);
    expect(ok.body.status).toBe('present');
    expect((await newPhone.b.get('/api/me')).body.device).toBe('registered');
    expect((await oldPhone.b.get('/api/me')).body.device).toBe('unregistered');

    // 출석 현황·다운로드
    const rows = await t.get(`/api/staff/attendance?date=${today}&sessionId=${s3}`);
    expect(rows.body.rows.find((r: any) => r.studentNo === '20230007').status).toBe('present');
    const xlsx = await request(app.getHttpServer()).get(`/api/staff/attendance/export?date=${today}&format=xlsx`).set('Cookie', Object.entries(t.cookies).map(([k, v]) => `${k}=${v}`).join('; '));
    expect(xlsx.headers['content-type']).toContain('spreadsheetml');

    // 강의실 코드 화면은 총관리자만 (인솔자는 404)
    expect((await t.get(`/api/staff/sessions/${s3}/code`)).status).toBe(404);
    const code = await admin.get(`/api/admin/sessions/${s3}/code`);
    expect(code.body).toMatchObject({ code: roomCodeAt(s3).code, enrolled: expect.any(Number) });
  });

  it('한 컴퓨터(같은 브라우저)에서 총관리자·인솔자·학생이 같이 로그인해도 서로 로그아웃시키지 않음', async () => {
    const pc = new Browser(app);
    pc.cookies = { ...admin.cookies }; // 총관리자로 로그인된 PC
    pc.area = 'staff';
    await pc.post('/api/auth/staff/login', { schoolId, staffNo: 'S1', name: '김담당' });
    await pc.post('/api/auth/staff/verify', { schoolCode: '1234' });
    pc.area = 'student';
    expect((await pc.post('/api/auth/student/login', { schoolId, studentNo: '20230007', name: '정민재' })).status).toBe(201);
    expect(Object.keys(pc.cookies).sort()).toEqual(['did', 'sid_a', 'sid_s', 'sid_t']);

    // 각 화면에서 새로고침(GET /api/me) → 자기 역할 그대로
    pc.area = 'admin';
    expect((await pc.get('/api/me')).body.role).toBe('admin');
    pc.area = 'staff';
    expect((await pc.get('/api/me')).body.role).toBe('staff');
    pc.area = 'student';
    expect((await pc.get('/api/me')).body.role).toBe('student');

    // 학생 화면에서 로그아웃해도 인솔자·총관리자는 그대로
    await pc.post('/api/auth/logout');
    expect((await pc.get('/api/me')).body.role).toBe('staff'); // 학생 쿠키가 없으면 인솔자 → 화면이 /staff 로 보냄
    pc.area = 'admin';
    expect((await pc.get('/api/me')).body.role).toBe('admin');

    // 인솔자 쿠키로는 총관리자 API를 못 쓴다
    const staffOnly = new Browser(app);
    staffOnly.cookies = { sid_a: pc.cookies.sid_t };
    staffOnly.area = 'admin';
    expect((await staffOnly.get('/api/admin/dashboard')).status).toBe(401);
  });

  it('출결 변경: 인솔자 신청 → 총관리자 승인 / 10분 지나면 우선 거절 → 나중에 승인', async () => {
    const t = new Browser(app);
    await t.post('/api/auth/staff/login', { schoolId, staffNo: 'S1', name: '김담당' });
    await t.post('/api/auth/staff/verify', { schoolCode: '1234' });
    const s1 = (await prisma.session.findFirstOrThrow({ where: { course: { name: 'AI 기초' } } })).id;
    const canceled = await prisma.student.findFirstOrThrow({ where: { studentNo: '20231235' } });

    const req1 = await t.post('/api/staff/change-requests', { studentId: canceled.id, sessionId: s1, toStatus: 'excused', reason: '휴대폰 고장으로 친구 폰 사용 (확인함)' });
    expect(req1.body).toMatchObject({ status: 'pending', fromStatus: 'canceled', toStatus: 'excused' });
    expect((await t.post('/api/staff/change-requests', { studentId: canceled.id, sessionId: s1, toStatus: 'present', reason: '중복' })).status).toBe(409);
    const ap = await admin.post(`/api/admin/change-requests/${req1.body.id}/approve`);
    expect(ap.body.status).toBe('approved');
    expect((await prisma.attendance.findFirstOrThrow({ where: { studentId: canceled.id, sessionId: s1 } })).status).toBe('excused');

    // 10분 우선 거절
    const s2 = (await prisma.session.findFirstOrThrow({ where: { course: { name: '데이터 분석' } } })).id;
    const st = await prisma.student.findFirstOrThrow({ where: { studentNo: '20231234' } });
    const req2 = await t.post('/api/staff/change-requests', { studentId: st.id, sessionId: s2, toStatus: 'excused', reason: '병원 진료' });
    expect(req2.body.fromStatus).toBe('absent'); // 미출이면 결석 행을 먼저 만든다
    const changes = app.get(ChangeRequestsService);
    expect(await changes.autoRejectExpired(new Date(Date.now() + 11 * 60000))).toBe(1);
    const review = await admin.get('/api/admin/change-requests?status=auto_rejected');
    expect(review.body.map((r: any) => r.id)).toContain(req2.body.id);
    expect((await admin.post(`/api/admin/change-requests/${req2.body.id}/approve`)).body.status).toBe('approved');

    const dash = await admin.get('/api/admin/dashboard');
    expect(dash.status).toBe(200);
    expect(dash.body.proxyCanceledToday).toBe(2);
  });

  it('엑셀: 장소·수업 일정 템플릿 → 미리보기(오류 표시) → 확정', async () => {
    const tpl = await request(app.getHttpServer()).get('/api/admin/import/sessions/template').set('Cookie', Object.entries(admin.cookies).map(([k, v]) => `${k}=${v}`).join('; ')).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(tpl.body);
    const ws = wb.getWorksheet('수업 일정')!;
    ws.addRow(['AI 기초', '2026-11-06', '1', '10:00', '11:50', '공학관 301']);
    ws.addRow(['데이터 분석', '2026-11-06', '2', '13:00', '12:00', '없는 장소']);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    const cookie = Object.entries(admin.cookies).map(([k, v]) => `${k}=${v}`).join('; ');
    const prev = await request(app.getHttpServer()).post('/api/admin/import/sessions/preview').set('Cookie', cookie).attach('file', buf, '일정.xlsx');
    expect(prev.status).toBe(201);
    expect(prev.body.counts.error).toBe(2); // 종료가 시작보다 이름 + 없는 장소
    expect((await admin.post(`/api/admin/import/${prev.body.jobId}/confirm`, { mode: 'update' })).status).toBe(400);

    ws.spliceRows(3, 1);
    const buf2 = Buffer.from(await wb.xlsx.writeBuffer());
    const prev2 = await request(app.getHttpServer()).post('/api/admin/import/sessions/preview').set('Cookie', cookie).attach('file', buf2, '일정.xlsx');
    expect(prev2.body.counts).toMatchObject({ create: 1, error: 0 });
    expect((await admin.post(`/api/admin/import/${prev2.body.jobId}/confirm`, { mode: 'update' })).body).toEqual({ created: 1, updated: 0, skipped: 0 });
  });
});
