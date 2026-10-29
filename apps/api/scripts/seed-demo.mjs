// 개발·시연용 가짜 데이터 넣기 (npm run db:seed:demo -w apps/api)
// 실제 학생 정보는 절대 넣지 않는다. 오늘 날짜로 지금 출석할 수 있는 수업을 만든다.
// 서버 PC 운영 DB에는 쓰지 말 것.
import { PrismaClient } from '@prisma/client';
import { createHmac } from 'node:crypto';

if (process.env.NODE_ENV === 'production') {
  console.error('운영 환경에서는 실행할 수 없어요.');
  process.exit(1);
}
const prisma = new PrismaClient();
const secret = process.env.APP_SECRET;
const hmac = (purpose, v) => createHmac('sha256', secret).update(`${purpose}:${v}`).digest('hex');

const kst = new Date(Date.now() + 9 * 3600 * 1000);
const today = kst.toISOString().slice(0, 10);
const hhmm = (d) => d.toISOString().slice(11, 16);
const startNow = new Date(kst.getTime() - 2 * 60 * 1000); // 2분 전 시작 → 지금 "출석" 시간
const endNow = new Date(kst.getTime() + 110 * 60 * 1000);

const schools = [
  { name: '한국대', code: '1111' },
  { name: '미래대', code: '2222' },
];
for (const s of schools) {
  await prisma.school.upsert({ where: { name: s.name }, create: { name: s.name, codeHash: hmac('school-code', s.code), codeChangedAt: new Date() }, update: { codeHash: hmac('school-code', s.code) } });
}
const korea = await prisma.school.findUniqueOrThrow({ where: { name: '한국대' } });
const mirae = await prisma.school.findUniqueOrThrow({ where: { name: '미래대' } });

await prisma.staff.upsert({
  where: { schoolId_staffNo: { schoolId: korea.id, staffNo: 'S2024001' } },
  create: { schoolId: korea.id, staffNo: 'S2024001', name: '김담당', email: 'staff1@example.com' },
  update: {},
});
await prisma.staff.upsert({
  where: { schoolId_staffNo: { schoolId: mirae.id, staffNo: 'M2024001' } },
  create: { schoolId: mirae.id, staffNo: 'M2024001', name: '이담당', email: 'staff2@example.com' },
  update: {},
});

const students = [
  [korea.id, '20231234', '홍길동', '공과대학', '컴퓨터공학과'],
  [korea.id, '20231235', '김하늘', '공과대학', '컴퓨터공학과'],
  [korea.id, '20221111', '박하은', '자연과학대학', '수학과'],
  [mirae.id, '20210455', '정민재', 'IT대학', '소프트웨어학과'],
  [mirae.id, '20230007', '최도윤', 'IT대학', '정보보호학과'],
];
for (const [schoolId, studentNo, name, college, department] of students) {
  await prisma.student.upsert({ where: { schoolId_studentNo: { schoolId, studentNo } }, create: { schoolId, studentNo, name, college, department }, update: {} });
}

// 시연용 좌표: 서울시청 근처 (실제 강의실 좌표는 총관리자 화면에서 입력)
const loc = await prisma.location.upsert({ where: { name: '공학관 301 (예시)' }, create: { name: '공학관 301 (예시)', latitude: 37.5663, longitude: 126.9779, radiusM: 50 }, update: {} });
const loc2 = await prisma.location.upsert({ where: { name: '본관 105 (예시)' }, create: { name: '본관 105 (예시)', latitude: 37.5651, longitude: 126.9895, radiusM: 50 }, update: {} });
const c1 = await prisma.course.upsert({ where: { name: 'AI 기초' }, create: { name: 'AI 기초' }, update: {} });
const c2 = await prisma.course.upsert({ where: { name: '데이터 분석' }, create: { name: '데이터 분석' }, update: {} });
const date = new Date(`${today}T00:00:00.000Z`);
await prisma.session.upsert({
  where: { courseId_classDate_period: { courseId: c1.id, classDate: date, period: 1 } },
  create: { courseId: c1.id, classDate: date, period: 1, startTime: hhmm(startNow), endTime: hhmm(endNow), locationId: loc.id },
  update: { startTime: hhmm(startNow), endTime: hhmm(endNow) },
});
await prisma.session.upsert({
  where: { courseId_classDate_period: { courseId: c2.id, classDate: date, period: 3 } },
  create: { courseId: c2.id, classDate: date, period: 3, startTime: '23:00', endTime: '23:50', locationId: loc2.id },
  update: {},
});
const allStudents = await prisma.student.findMany();
const allSessions = await prisma.session.findMany();
await prisma.enrollment.createMany({ data: allStudents.flatMap((s) => allSessions.map((x) => ({ studentId: s.id, sessionId: x.id }))), skipDuplicates: true });

console.log(`✅ 시연 데이터 준비 완료 (${today})`);
console.log('   학생: 한국대 / 20231234 / 홍길동   인솔자: 한국대 / S2024001 / 김담당 / 학교 코드 1111');
console.log(`   1교시 AI 기초 ${hhmm(startNow)}~${hhmm(endNow)} (장소 좌표 37.5663, 126.9779)`);
await prisma.$disconnect();
