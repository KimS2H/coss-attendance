// ─────────────────────────────────────────────
// 총관리자 화면 틀: 로그인 확인 + 남색 상단 막대(메뉴) + 본문.
//
// 처음 열릴 때 순서
//  1) GET /api/admin/setup/status → 첫 설정이 안 끝났으면 /admin/setup 으로
//  2) GET /api/me → 총관리자로 로그인하지 않았으면 /admin/login 으로
//  3) 통과하면 메뉴와 화면(Outlet)을 보여 준다
// 쓰는 도중 세션이 끝나면(401) client.ts 가 'coss:unauthorized' 신호를 보내고,
// 여기서 받아 로그인 화면으로 보낸다.
// ─────────────────────────────────────────────
import { useCallback, useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { api, ApiRequestError } from '../../api/client';
import type { Me } from '../../api/types';
import { BrandWide } from '../../components/Brand';
import { adminError } from '../../components/admin/format';
import { getSetupStatus } from '../../components/admin/setupStatus';
import { LoadError } from '../../components/admin/ui';

// 상단 메뉴 목록 (주소, 이름)
const MENU: { to: string; label: string; end?: boolean }[] = [
  { to: '/admin', label: '대시보드', end: true },
  { to: '/admin/attendance', label: '전체 출석 현황' },
  { to: '/admin/change-requests', label: '출결 변경 승인' },
  { to: '/admin/support', label: '문의·오류' },
  { to: '/admin/devices', label: '기기 승인' },
  { to: '/admin/accounts', label: '계정·학교 코드' },
  { to: '/admin/sessions', label: '장소·일정' },
  { to: '/admin/import', label: '엑셀 등록' },
  { to: '/admin/settings', label: '설정' },
];

export default function AdminLayout() {
  const navigate = useNavigate();
  // checking: 확인 중 / ok: 통과 / { error }: 확인 중 오류(네트워크 등)
  const [state, setState] = useState<'checking' | 'ok' | { error: string }>('checking');
  const [username, setUsername] = useState('');

  // 첫 설정 여부 → 로그인 여부 순서로 확인
  const check = useCallback(async () => {
    setState('checking');
    try {
      const setup = await getSetupStatus();
      if (!setup.completed) {
        navigate('/admin/setup', { replace: true });
        return;
      }
      const me = await api.get<Me>('/api/me');
      if (me.role !== 'admin') {
        navigate('/admin/login', { replace: true });
        return;
      }
      setUsername(me.admin.username);
      setState('ok');
    } catch (e) {
      // 첫 설정이 안 끝났다는 오류(SETUP_REQUIRED) → 첫 설정 화면
      if (e instanceof ApiRequestError && e.code === 'SETUP_REQUIRED') {
        navigate('/admin/setup', { replace: true });
        return;
      }
      // 로그인 안 함(401)·권한 없음(403) → 로그인 화면
      if (e instanceof ApiRequestError && (e.status === 401 || e.status === 403)) {
        navigate('/admin/login', { replace: true });
        return;
      }
      setState({ error: adminError(e) });
    }
  }, [navigate]);

  useEffect(() => {
    void check();
  }, [check]);

  // 사용 중 세션 만료 → 로그인 화면
  useEffect(() => {
    const onUnauthorized = () => navigate('/admin/login', { replace: true });
    window.addEventListener('coss:unauthorized', onUnauthorized);
    return () => window.removeEventListener('coss:unauthorized', onUnauthorized);
  }, [navigate]);

  async function logout() {
    try {
      await api.post('/api/auth/logout');
    } catch {
      // 이미 세션이 끝났어도 로그인 화면으로 이동
    }
    navigate('/admin/login', { replace: true });
  }

  return (
    <div className="adm-page">
      {/* ── 남색 상단 막대: 로고·서비스 이름, 총관리자 표시, 메뉴, 인증 PC 표시, 로그아웃 ── */}
      <header className="adm-topbar">
        <span className="adm-brand">
          <BrandWide />
          <span className="adm-role-chip">총관리자</span>
        </span>
        {state === 'ok' && (
          <nav className="adm-nav" aria-label="총관리자 메뉴">
            {MENU.map((m) => (
              <NavLink key={m.to} to={m.to} end={m.end} className={({ isActive }) => (isActive ? 'active' : '')}>
                {m.label}
              </NavLink>
            ))}
          </nav>
        )}
        {state === 'ok' && (
          <span className="adm-topbar-right">
            <span className="adm-pc-pill" title={`로그인: ${username}`}>
              <span className="dot" aria-hidden="true" />
              인증 PC 접속 중
            </span>
            <button type="button" className="adm-logout" onClick={logout}>
              로그아웃
            </button>
          </span>
        )}
      </header>

      {/* ── 본문 ── */}
      <main className="adm-main">
        {state === 'checking' && <p className="adm-empty">확인 중…</p>}
        {typeof state === 'object' && <LoadError message={state.error} onRetry={check} />}
        {state === 'ok' && <Outlet />}
      </main>
    </div>
  );
}
