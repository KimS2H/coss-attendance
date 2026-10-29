// L-03 강의실 코드 화면 (프로젝터·TV에 띄우는 전체 화면).
// - GET /api/staff/sessions/:id/code 로 코드와 남은 시간을 받는다
// - 남은 시간은 화면에서 1초씩 줄이고, 0이 되면 새 코드를 다시 받는다
// - 출석 인원을 위해 10초마다도 다시 받는다
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, errorMessage } from '../../api/client';
import type { RoomCode } from '../../api/types';
import { LogoBadge, SERVICE_NAME } from '../../components/Brand';
import { addMinutes } from '../../components/format';
import { useInterval } from '../../components/hooks';

const CODE_PERIOD = 30; // 코드가 바뀌는 간격(초)

export default function CodePage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [rc, setRc] = useState<RoomCode | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [error, setError] = useState('');
  const fetching = useRef(false); // 같은 요청이 겹치지 않게

  const load = useCallback(async () => {
    if (fetching.current) return;
    fetching.current = true;
    try {
      const res = await api.get<RoomCode>(`/api/staff/sessions/${sessionId}/code`);
      setRc(res);
      setSecondsLeft(Math.max(1, res.secondsLeft)); // 0이 오면 1초 뒤에 다시 받기
      setError('');
    } catch (e) {
      setError(errorMessage(e));
      setSecondsLeft(3); // 실패하면 3초 뒤 다시 시도
    } finally {
      fetching.current = false;
    }
  }, [sessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  // 1초마다 남은 시간 줄이기 → 0이 되면 새 코드 받기
  useInterval(() => {
    if (secondsLeft <= 1) {
      setSecondsLeft(0);
      void load();
    } else {
      setSecondsLeft(secondsLeft - 1);
    }
  }, 1000);

  // 10초마다 출석 인원 새로 고침
  useInterval(() => void load(), 10_000);

  // 전체 화면 (프로젝터용, 버튼을 눌러야 브라우저가 허락함)
  async function fullscreen() {
    try {
      await document.documentElement.requestFullscreen();
    } catch {
      // 지원하지 않는 브라우저면 무시
    }
  }

  async function close() {
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch {
        // 무시
      }
    }
    navigate('/staff');
  }

  const s = rc?.session;
  const digits = (rc?.code ?? '----').split('');
  const percent = Math.min(100, Math.max(0, (secondsLeft / CODE_PERIOD) * 100));

  return (
    <div className="sf-code-screen">
      {/* 위: 수업 이름 + 출석 인원 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 24 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <p style={{ margin: 0, fontSize: 34, fontWeight: 700 }}>{s ? `${s.period}교시 | ${s.courseName}` : '강의실 코드'}</p>
          {s && (
            <p style={{ margin: 0, fontSize: 20, color: 'var(--on-dark-2)' }}>
              {/* 출석 시간: 시작 5분 전 ~ 시작 5분 후 */}
              {s.locationName} · 출석 {addMinutes(s.startTime, -5)} ~ {addMinutes(s.startTime, 5)}
            </p>
          )}
        </div>
        {rc && (
          <div style={{ padding: '14px 24px', borderRadius: 16, background: 'var(--navy)', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <span style={{ fontSize: 16, color: 'var(--on-dark-2)' }}>출석</span>
            <span style={{ fontSize: 36, fontWeight: 700 }}>
              {rc.attended} <span style={{ fontSize: 22, color: 'var(--on-dark-2)' }}>/ {rc.enrolled}명</span>
            </span>
          </div>
        )}
      </div>

      {/* 가운데: 큰 숫자 4개 + 남은 시간 막대 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 28, padding: '24px 0' }}>
        <p style={{ margin: 0, fontSize: 24, color: 'var(--on-dark)', textAlign: 'center' }}>휴대폰에서 출석 버튼을 누르고 이 숫자를 입력하세요</p>
        <div className="sf-code-digits" role="img" aria-label={`출석 코드 ${rc?.code ?? ''}`}>
          {digits.map((d, i) => (
            <span key={i} className="sf-code-digit">
              {d}
            </span>
          ))}
        </div>
        <div style={{ width: '100%', maxWidth: 760, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ height: 12, borderRadius: 6, background: 'rgba(255,255,255,0.18)', overflow: 'hidden' }}>
            <div style={{ height: 12, borderRadius: 6, background: 'var(--warn-line)', width: `${percent}%`, transition: 'width 1s linear' }} />
          </div>
          <p style={{ margin: 0, fontSize: 20, color: 'var(--on-dark)', textAlign: 'center' }}>{secondsLeft}초 후 새 코드로 바뀝니다</p>
          {error && <p style={{ margin: 0, fontSize: 16, color: '#fecaca', textAlign: 'center' }}>{error} (자동으로 다시 시도해요)</p>}
        </div>
      </div>

      {/* 아래: 로고 + 서비스 이름 / 버튼들 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 18, fontWeight: 700, color: 'var(--on-dark)' }}>
          <LogoBadge size={44} />
          {SERVICE_NAME}
        </span>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" className="sf-code-btn" onClick={() => void fullscreen()}>
            전체 화면
          </button>
          <button type="button" className="sf-code-btn" onClick={() => void close()}>
            코드 표시 종료
          </button>
        </div>
      </div>
    </div>
  );
}
