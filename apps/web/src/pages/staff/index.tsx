// 인솔자(담당자) 화면 묶음. 주소는 모두 /staff 아래.
//   /staff/verify            2차 인증 (학교 코드)
//   /staff                   출석 현황
//   /staff/code/:sessionId   강의실 코드 (프로젝터용 전체 화면)
//   /staff/devices           기기 승인
//   /staff/support           문의함
//   /staff/students          학생·수강 관리
//   /staff/import            엑셀 등록
import { useCallback, useEffect, useState } from 'react';
import { Navigate, Outlet, Route, Routes, useNavigate } from 'react-router-dom';
import { api, ApiRequestError } from '../../api/client';
import type { Me, StaffInfo } from '../../api/types';
import { useUnauthorizedRedirect } from '../../components/hooks';
import type { StaffContext } from './context';
import StaffLayout from './StaffLayout';
import VerifyPage from './VerifyPage';
import AttendancePage from './AttendancePage';
import CodePage from './CodePage';
import DevicesPage from './DevicesPage';
import SupportPage from './SupportPage';
import StudentsPage from './StudentsPage';
import ImportPage from './ImportPage';
import './staff.css';

export default function StaffRoutes() {
  // 로그인이 만료되면 로그인 화면으로
  useUnauthorizedRedirect();
  return (
    <Routes>
      {/* 2차 인증은 반쯤 로그인된 상태라 로그인 확인(StaffGate) 밖에 둔다 */}
      <Route path="verify" element={<VerifyPage />} />
      <Route element={<StaffGate />}>
        {/* 프로젝터용 코드 화면은 위쪽 메뉴 없이 전체 화면 */}
        <Route path="code/:sessionId" element={<CodePage />} />
        <Route element={<StaffLayout />}>
          <Route index element={<AttendancePage />} />
          <Route path="devices" element={<DevicesPage />} />
          <Route path="support" element={<SupportPage />} />
          <Route path="students" element={<StudentsPage />} />
          <Route path="import" element={<ImportPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/staff" replace />} />
    </Routes>
  );
}

/** 로그인 확인: GET /api/me 가 인솔자가 아니면 로그인 화면으로 보낸다 */
function StaffGate() {
  const navigate = useNavigate();
  const [staff, setStaff] = useState<StaffInfo | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const me = await api.get<Me>('/api/me');
      if (me.role !== 'staff') return navigate('/login', { replace: true });
      setStaff(me.staff);
    } catch (e) {
      if (e instanceof ApiRequestError && (e.status === 401 || e.status === 403)) return navigate('/login', { replace: true });
      setError(e instanceof ApiRequestError ? e.message : '잠시 후 다시 시도해 주세요.');
    }
  }, [navigate]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <div className="sf-empty">
        <p>{error}</p>
        <button type="button" className="btn" onClick={() => void load()}>
          다시 시도
        </button>
      </div>
    );
  }
  if (!staff) return <p className="sf-empty">불러오는 중…</p>;

  const ctx: StaffContext = { staff, canEdit: staff.permission === 'edit', refreshCounts: () => {} };
  return <Outlet context={ctx} />;
}
