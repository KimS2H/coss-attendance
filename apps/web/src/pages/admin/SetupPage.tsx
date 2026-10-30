// ─────────────────────────────────────────────
// A-00 첫 설정 (ADM-16). 서버를 처음 켰을 때 한 번만 한다.
//  1단계 계정: 아이디·비밀번호(12자 이상) 만들기
//  2단계 이메일: 알림 메일을 보낼 SMTP 계정 입력 (테스트 메일 성공해야 저장)
//  마지막: "설정 완료" → 로그인 화면
// 중간에 창을 닫아도 서버가 기억하는 단계(SetupStatus.step)부터 다시 이어서 한다.
// ─────────────────────────────────────────────
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import type { SetupStatus, SmtpInput } from '../../api/types';
import SmtpForm from '../../components/admin/SmtpForm';
import { adminError } from '../../components/admin/format';
import { getSetupStatus } from '../../components/admin/setupStatus';
import { Alert, CenterShell, LoadError } from '../../components/admin/ui';

type Step = SetupStatus['step'];

export default function SetupPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step | null>(null); // null = 서버에 묻는 중
  const [loadError, setLoadError] = useState<string | null>(null);

  async function loadStatus() {
    setLoadError(null);
    try {
      const s = await getSetupStatus();
      if (s.completed) {
        navigate('/admin/login', { replace: true });
        return;
      }
      setStep(s.step);
    } catch (e) {
      setLoadError(adminError(e));
    }
  }

  useEffect(() => {
    void loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const order: Step[] = ['account', 'smtp', 'done'];
  const nowIndex = step ? order.indexOf(step) : -1;

  return (
    <CenterShell>
      <h1>첫 설정</h1>
      {/* 단계 표시 */}
      <div className="adm-steps" aria-label="설정 단계">
        {['1 계정', '2 이메일'].map((label, i) => (
          <span key={label} className={i === nowIndex ? 'now' : i < nowIndex ? 'done' : ''}>
            {label}
          </span>
        ))}
      </div>

      {loadError && <LoadError message={loadError} onRetry={loadStatus} />}
      {!step && !loadError && <p className="adm-empty">확인 중…</p>}

      {step === 'account' && <AccountStep onDone={() => setStep('smtp')} />}
      {step === 'smtp' && <SmtpStep onDone={() => setStep('done')} />}
      {step === 'done' && <CompleteStep onDone={() => navigate('/admin/login', { replace: true })} />}
    </CenterShell>
  );
}

/** 1단계: 총관리자 계정 만들기 */
function AccountStep({ onDone }: { onDone: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!username.trim()) return setError('아이디를 입력해 주세요.');
    if (password.length < 12) return setError('비밀번호는 12자 이상이어야 해요.');
    if (password !== password2) return setError('비밀번호 확인이 일치하지 않아요.');
    setBusy(true);
    try {
      await api.post('/api/admin/setup/account', { username: username.trim(), password });
      onDone();
    } catch (err) {
      setError(adminError(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <p className="adm-help" style={{ marginBottom: 14 }}>
        총관리자 계정을 만들어요. 비밀번호는 12자 이상으로 정하고 안전한 곳에 보관하세요.
      </p>
      <div className="field">
        <label className="label" htmlFor="su-id">아이디</label>
        <input id="su-id" className="input" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus />
      </div>
      <div className="field">
        <label className="label" htmlFor="su-pw">비밀번호 (12자 이상)</label>
        <input id="su-pw" className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
      </div>
      <div className="field">
        <label className="label" htmlFor="su-pw2">비밀번호 확인</label>
        <input id="su-pw2" className="input" type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} autoComplete="new-password" />
      </div>
      {error && <Alert kind="error">{error}</Alert>}
      <button type="submit" className="btn block" disabled={busy} style={{ marginTop: 12 }}>
        {busy ? '만드는 중…' : '다음'}
      </button>
    </form>
  );
}

/** 2단계: 이메일(SMTP) 설정 */
function SmtpStep({ onDone }: { onDone: () => void }) {
  return (
    <SmtpForm
      onSubmit={async (input: SmtpInput) => {
        await api.post('/api/admin/setup/smtp', input);
        onDone();
        return '테스트 메일을 보냈고 설정을 저장했어요.';
      }}
    />
  );
}

/** 마지막: 설정 완료 */
function CompleteStep({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function complete() {
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/admin/setup/complete');
      onDone();
    } catch (err) {
      setError(adminError(err));
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Alert kind="ok">계정과 이메일 설정이 모두 끝났어요. 테스트 메일이 도착했는지 확인해 주세요.</Alert>
      {error && <Alert kind="error">{error}</Alert>}
      <button type="button" className="btn block" onClick={complete} disabled={busy}>
        {busy ? '저장 중…' : '설정 완료'}
      </button>
    </div>
  );
}
