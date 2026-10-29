// 학생 화면 묶음 (주소: /login, /consent, /, /support).
// /login 은 학생·인솔자가 같이 쓰는 로그인 화면이다.
import { useCallback, useEffect, useState } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { api, ApiRequestError } from '../../api/client';
import type { Me, StudentMe } from '../../api/types';
import { useUnauthorizedRedirect } from '../../components/hooks';
import type { StudentContext } from './context';
import LoginPage from './LoginPage';
import ConsentPage from './ConsentPage';
import MainPage from './MainPage';
import SupportPage from './SupportPage';
import './student.css';

export default function StudentRoutes() {
  // 로그인이 만료되면 어느 화면에서든 로그인 화면으로
  useUnauthorizedRedirect();
  return (
    <Routes>
      <Route path="login" element={<LoginPage />} />
      <Route element={<StudentGate />}>
        <Route index element={<MainPage />} />
        <Route path="consent" element={<ConsentPage />} />
        <Route path="support" element={<SupportPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

/**
 * 시작 확인: GET /api/me 로 누가 로그인했는지 확인하고 알맞은 화면으로 보낸다.
 *  - 학생: 동의가 필요하면 /consent, 아니면 그대로
 *  - 인솔자: /staff,  총관리자: /admin,  로그인 안 함(401): /login
 */
function StudentGate() {
  const navigate = useNavigate();
  const location = useLocation();
  const [me, setMe] = useState<StudentMe | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await api.get<Me>('/api/me');
      if (res.role === 'staff') return navigate('/staff', { replace: true });
      if (res.role === 'admin') return navigate('/admin', { replace: true });
      setMe(res);
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 401) return navigate('/login', { replace: true });
      setError(e instanceof ApiRequestError ? e.message : '잠시 후 다시 시도해 주세요.');
    }
  }, [navigate]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <div className="st-page">
        <div className="st-center-msg">
          <p>{error}</p>
          <button type="button" className="btn" onClick={() => void load()}>
            다시 시도
          </button>
        </div>
      </div>
    );
  }
  if (!me) {
    return (
      <div className="st-page">
        <p className="st-center-msg">불러오는 중…</p>
      </div>
    );
  }
  // 동의를 아직 안 했으면 동의 화면으로 (동의 화면 자신은 제외)
  if (me.needsConsent && location.pathname !== '/consent') return <Navigate to="/consent" replace />;
  // 이미 동의했는데 동의 화면에 들어오면 첫 화면으로
  if (!me.needsConsent && location.pathname === '/consent') return <Navigate to="/" replace />;

  const ctx: StudentContext = { me, setMe };
  return <Outlet context={ctx} />;
}
