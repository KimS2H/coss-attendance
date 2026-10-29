// ─────────────────────────────────────────────
// A-01 총관리자 로그인: 아이디 + 비밀번호 + OTP 6자리.
// 첫 설정이 안 끝났으면 첫 설정 화면으로 보낸다.
// ─────────────────────────────────────────────
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import type { AdminMe } from '../../api/types';
import { getSetupStatus } from '../../components/admin/setupStatus';
import { adminError } from '../../components/admin/format';
import { Alert, CenterShell } from '../../components/admin/ui';

export default function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 첫 설정이 안 끝났으면 /admin/setup 으로 (오류는 무시하고 로그인 화면 유지)
  useEffect(() => {
    getSetupStatus()
      .then((s) => {
        if (!s.completed) navigate('/admin/setup', { replace: true });
      })
      .catch(() => {});
  }, [navigate]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!username.trim() || !password) return setError('아이디와 비밀번호를 입력해 주세요.');
    if (!/^\d{6}$/.test(otp)) return setError('OTP 6자리 숫자를 입력해 주세요.');
    setBusy(true);
    try {
      await api.post<AdminMe>('/api/admin/auth/login', { username: username.trim(), password, otp });
      navigate('/admin', { replace: true });
    } catch (err) {
      setError(adminError(err));
      setOtp('');
      setBusy(false);
    }
  }

  return (
    <CenterShell>
      <h1>총관리자 로그인</h1>
      <form onSubmit={submit}>
        <div className="field">
          <label className="label" htmlFor="lg-id">아이디</label>
          <input id="lg-id" className="input" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus />
        </div>
        <div className="field">
          <label className="label" htmlFor="lg-pw">비밀번호</label>
          <input id="lg-pw" className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </div>
        <div className="field">
          <label className="label" htmlFor="lg-otp">OTP 6자리</label>
          <input
            id="lg-otp"
            className="input adm-code-input"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
          />
          <span className="adm-small" style={{ marginTop: 6 }}>휴대폰 OTP 앱에 보이는 6자리 숫자</span>
        </div>
        {error && <Alert kind="error">{error}</Alert>}
        <button type="submit" className="btn block" disabled={busy} style={{ marginTop: 12 }}>
          {busy ? '로그인 중…' : '로그인'}
        </button>
      </form>
    </CenterShell>
  );
}
