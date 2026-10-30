// ─────────────────────────────────────────────
// 강의실 코드 화면 (/admin/code/:sessionId). 프로젝터·TV에 띄우는 전체 화면.
// 총관리자가 "장소·일정"에서 수업을 골라 그때그때 띄운다. (인솔자는 띄울 수 없음)
// 상단 메뉴 없이 전체 화면으로 보여 주고, 로그인이 끝나 있으면 로그인 화면으로 보낸다.
// ─────────────────────────────────────────────
import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import RoomCodeScreen from '../../components/RoomCodeScreen';

export default function CodePage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  // 로그인이 끝났으면(401) 로그인 화면으로
  useEffect(() => {
    const onUnauthorized = () => navigate('/admin/login', { replace: true });
    window.addEventListener('coss:unauthorized', onUnauthorized);
    return () => window.removeEventListener('coss:unauthorized', onUnauthorized);
  }, [navigate]);

  return <RoomCodeScreen codeUrl={`/api/admin/sessions/${sessionId}/code`} onClose={() => navigate('/admin/sessions')} />;
}
