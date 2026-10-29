// "내 정보" 응답 만들기 (로그인 응답과 /api/me가 같이 쓴다)
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

/** 동의서 버전. 동의서 내용을 바꾸면 이 값을 바꿔 다시 동의받는다 */
export const CONSENT_VERSION = '2026-11-v1';

@Injectable()
export class MeService {
  constructor(private prisma: PrismaService) {}

  async student(studentId: number) {
    const st = await this.prisma.student.findUniqueOrThrow({
      where: { id: studentId },
      include: { school: true, consents: { where: { version: CONSENT_VERSION } } },
    });
    return {
      role: 'student' as const,
      student: { id: st.id, schoolName: st.school.name, college: st.college, department: st.department, studentNo: st.studentNo, name: st.name },
      needsConsent: !st.consents.some((c) => c.consentType === 'privacy'),
    };
  }

  async staff(staffId: number) {
    const t = await this.prisma.staff.findUniqueOrThrow({ where: { id: staffId }, include: { school: true } });
    return { role: 'staff' as const, staff: { id: t.id, schoolId: t.schoolId, schoolName: t.school.name, name: t.name, permission: t.permission } };
  }
}
