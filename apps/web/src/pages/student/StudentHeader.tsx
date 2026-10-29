// 학생 화면 위쪽 남색 막대.
// 로고·서비스 이름 + "문의" 버튼(항상 보이게) + 로그아웃 버튼,
// 둘째 줄에 "한국대 컴퓨터공학과 홍길동(20231234)".
// children을 넣으면 그 아래에 더 보여 준다 (동의 화면의 제목 등).
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import type { StudentInfo } from '../../api/types';
import { BrandCompact } from '../../components/Brand';
import { IconHelp, IconLogout } from '../../components/Icons';

export function studentLabel(s: StudentInfo) {
  return `${s.schoolName} ${s.department} ${s.name}(${s.studentNo})`;
}

export function StudentHeader({ student, children }: { student: StudentInfo; children?: React.ReactNode }) {
  const navigate = useNavigate();

  async function logout() {
    try {
      await api.post('/api/auth/logout');
    } catch {
      // 이미 만료된 경우 등은 무시하고 로그인 화면으로
    }
    navigate('/login', { replace: true });
  }

  return (
    <header className="st-header">
      <div className="st-header-row">
        <BrandCompact />
        <Link to="/support" className="st-help-pill">
          <IconHelp size={16} />
          문의
        </Link>
        <button type="button" className="st-icon-btn" aria-label="로그아웃" onClick={() => void logout()}>
          <IconLogout size={22} />
        </button>
      </div>
      <p className="st-header-who">{studentLabel(student)}</p>
      {children}
    </header>
  );
}
