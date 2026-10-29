// L-01 인솔자 2차 인증: 학교 코드 4자리 입력.
// 로그인 화면에서 학교·직번·이름이 맞으면 이 화면으로 온다 (5분 안에 입력해야 함).
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api, ApiRequestError, errorMessage } from '../../api/client';
import type { StaffMe } from '../../api/types';
import { BrandWide } from '../../components/Brand';
import { DigitInputs } from '../../components/DigitInputs';
import { IconLock } from '../../components/Icons';

export default function VerifyPage() {
  const navigate = useNavigate();
  // 로그인 화면이 넘겨 준 학교 이름·이름 (새로 고침하면 없을 수 있음)
  const who = (useLocation().state ?? null) as { schoolName?: string; name?: string } | null;
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (code.length !== 4 || busy) return;
    setBusy(true);
    setError('');
    try {
      await api.post<StaffMe>('/api/auth/staff/verify', { schoolCode: code });
      navigate('/staff', { replace: true });
    } catch (e) {
      // 코드가 틀린 경우: 다시 입력 / 그 밖의 401(시간 초과·5회 실패로 세션 삭제): 처음부터 로그인
      if (e instanceof ApiRequestError && e.status === 401 && e.code !== 'SCHOOL_CODE_FAILED') {
        navigate('/login', { replace: true });
        return;
      }
      setError(errorMessage(e));
      setCode('');
      setBusy(false);
    }
  }

  const greeting = who?.name ? `${who.schoolName ? `${who.schoolName} ` : ''}${who.name}님, ` : '';

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      <header style={{ background: 'var(--navy-dark)', padding: '0 24px', minHeight: 60, display: 'flex', alignItems: 'center' }}>
        <BrandWide />
      </header>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 16px' }}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          style={{
            width: '100%',
            maxWidth: 440,
            background: '#fff',
            borderRadius: 20,
            boxShadow: '0 10px 30px rgba(15,31,77,0.10)',
            padding: '36px 32px',
            display: 'flex',
            flexDirection: 'column',
            gap: 22,
          }}
        >
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              background: 'var(--tint)',
              color: 'var(--navy)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <IconLock size={26} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>2차 인증</h1>
            <p style={{ margin: '6px 0 0', fontSize: 15, lineHeight: 1.6, color: 'var(--text-2)' }}>
              {greeting}학교 코드 4자리를 입력하세요.
            </p>
          </div>

          <fieldset style={{ margin: 0, padding: 0, border: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <legend style={{ padding: 0, marginBottom: 10, fontSize: 14, fontWeight: 500, color: 'var(--text-2)' }}>학교 코드</legend>
            <DigitInputs value={code} onChange={setCode} password autoFocus height={68} fontSize={28} labelPrefix="학교 코드 " onEnter={() => void submit()} />
            <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>5회 틀리면 처음부터 다시 로그인해야 해요.</p>
          </fieldset>

          {error && (
            <p role="alert" style={{ margin: 0, padding: '10px 12px', borderRadius: 10, background: 'var(--absent-bg)', color: 'var(--absent-text)', fontSize: 14 }}>
              {error}
            </p>
          )}

          <button type="submit" className="btn block" disabled={code.length !== 4 || busy}>
            {busy ? '확인 중…' : '확인'}
          </button>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: 'var(--muted)', textAlign: 'center' }}>
            학교 코드는 학교별로 정해져 있고 자동으로 바뀌지 않아요.
            <br />
            코드를 모르면 총관리자에게 문의하세요.
          </p>
        </form>
      </div>
    </div>
  );
}
