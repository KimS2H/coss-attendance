// 인솔자 화면 공통 틀: 남색 상단 막대(로고 + 메뉴 + 이름 + 로그아웃) 아래에 각 화면을 보여 준다.
// 메뉴의 숫자: 문의함 = 처리할 문의 수, 기기 승인 = 승인 대기 수 (30초마다 새로 고침)
import { useCallback, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate, useOutletContext } from 'react-router-dom';
import { api } from '../../api/client';
import type { DeviceApproval, Ticket } from '../../api/types';
import { BrandWide } from '../../components/Brand';
import { useInterval } from '../../components/hooks';
import { IconLogout } from '../../components/Icons';
import type { StaffContext } from './context';

export default function StaffLayout() {
  const parent = useOutletContext<StaffContext>();
  const navigate = useNavigate();
  const location = useLocation();
  const [openTickets, setOpenTickets] = useState(0);
  const [pendingDevices, setPendingDevices] = useState(0);

  // 메뉴 숫자 불러오기 (실패해도 화면은 그대로 쓸 수 있게 조용히 넘어간다)
  const refreshCounts = useCallback(() => {
    api
      .get<Ticket[]>('/api/staff/tickets')
      .then((list) => setOpenTickets(list.filter((t) => t.status === 'open' || t.status === 'in_progress').length))
      .catch(() => {});
    api
      .get<DeviceApproval[]>('/api/staff/device-approvals?status=pending')
      .then((list) => setPendingDevices(list.length))
      .catch(() => {});
  }, []);

  // 화면을 옮길 때마다, 그리고 30초마다 새로 고침
  useEffect(() => {
    refreshCounts();
  }, [refreshCounts, location.pathname]);
  useInterval(refreshCounts, 30_000);

  async function logout() {
    try {
      await api.post('/api/auth/logout');
    } catch {
      // 이미 만료된 경우 등은 무시
    }
    navigate('/login', { replace: true });
  }

  const ctx: StaffContext = { ...parent, refreshCounts };
  const { staff } = parent;

  return (
    <div className="sf-app">
      <header className="sf-topbar">
        <BrandWide />
        <nav className="sf-nav" aria-label="인솔자 메뉴">
          <NavLink to="/staff" end className={({ isActive }) => (isActive ? 'active' : '')}>
            출석 현황
          </NavLink>
          <NavLink to="/staff/students" className={({ isActive }) => (isActive ? 'active' : '')}>
            학생·수강 관리
          </NavLink>
          <NavLink to="/staff/import" className={({ isActive }) => (isActive ? 'active' : '')}>
            엑셀 등록
          </NavLink>
          <NavLink to="/staff/support" className={({ isActive }) => (isActive ? 'active' : '')}>
            문의함 {openTickets > 0 && <span className="sf-count">{openTickets}</span>}
          </NavLink>
          <NavLink to="/staff/devices" className={({ isActive }) => (isActive ? 'active' : '')}>
            기기 승인 {pendingDevices > 0 && <span className="sf-count">{pendingDevices}</span>}
          </NavLink>
        </nav>
        <div className="sf-user">
          <span>
            {staff.schoolName} 담당자: <strong>{staff.name}</strong>님{staff.permission === 'view' ? ' (보기 전용)' : ''}
          </span>
          <button type="button" className="sf-icon-btn" aria-label="로그아웃" onClick={() => void logout()}>
            <IconLogout size={22} />
          </button>
        </div>
      </header>
      <main className="sf-main">
        <Outlet context={ctx} />
      </main>
    </div>
  );
}
