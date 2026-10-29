// ─────────────────────────────────────────────
// 이메일(SMTP) 설정 입력 폼. 첫 설정 3단계와 "설정" 화면에서 함께 쓴다.
// "테스트 메일 보내고 저장"을 누르면 서버가 테스트 메일을 보내 보고,
// 성공해야 저장한다 (실패하면 서버가 400 오류와 이유를 돌려준다).
// ─────────────────────────────────────────────
import { useState, type FormEvent } from 'react';
import type { SmtpInput, SmtpSettings } from '../../api/types';
import { SERVICE_NAME_PLAIN } from '../Brand';
import { adminError } from './format';
import { Alert } from './ui';

type Props = {
  /** 이미 저장된 값 (설정 화면). 없으면 Gmail 기본값으로 채운다 */
  initial?: SmtpSettings | null;
  /** 저장 버튼을 눌렀을 때 실행. 성공하면 보여 줄 문장을 돌려준다. 실패하면 오류를 던진다 */
  onSubmit: (input: SmtpInput) => Promise<string>;
};

export default function SmtpForm({ initial, onSubmit }: Props) {
  const passwordSet = initial?.passwordSet ?? false;
  // 입력칸 값들
  const [host, setHost] = useState(initial?.host ?? 'smtp.gmail.com');
  const [port, setPort] = useState(String(initial?.port ?? 587));
  const [secure, setSecure] = useState(initial?.secure ?? false);
  const [user, setUser] = useState(initial?.user ?? '');
  const [password, setPassword] = useState('');
  const [fromName, setFromName] = useState(initial?.fromName ?? SERVICE_NAME_PLAIN);
  const [testTo, setTestTo] = useState(initial?.user ?? '');
  // 처리 상태
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  // 보안 연결(SSL)을 켜면 465, 끄면 587 로 포트를 맞춰 준다 (직접 바꾼 포트는 그대로)
  function toggleSecure(on: boolean) {
    setSecure(on);
    if (on && port === '587') setPort('465');
    if (!on && port === '465') setPort('587');
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(null);
    const portNum = Number(port);
    if (!host.trim() || !user.trim() || !testTo.trim()) return setError('SMTP 서버, 계정, 테스트 메일 받을 주소를 모두 입력해 주세요.');
    if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) return setError('포트는 1~65535 사이 숫자로 입력해 주세요.');
    if (!passwordSet && !password) return setError('앱 비밀번호를 입력해 주세요.');
    setBusy(true);
    try {
      // 비밀번호를 비워 보내면 서버가 기존 값을 그대로 쓴다 (설정 화면)
      const msg = await onSubmit({ host: host.trim(), port: portNum, secure, user: user.trim(), password, fromName: fromName.trim(), testTo: testTo.trim() });
      setDone(msg);
      setPassword('');
    } catch (err) {
      setError(adminError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <p className="adm-help" style={{ marginBottom: 12 }}>
        Gmail은 2단계 인증을 켠 뒤 '앱 비밀번호'를 만들어 입력해요.
      </p>
      <div className="adm-form-grid">
        <div className="field">
          <label className="label" htmlFor="smtp-host">SMTP 서버</label>
          <input id="smtp-host" className="input" value={host} onChange={(e) => setHost(e.target.value)} autoComplete="off" />
        </div>
        <div className="field">
          <label className="label" htmlFor="smtp-port">포트</label>
          <input id="smtp-port" className="input" inputMode="numeric" value={port} onChange={(e) => setPort(e.target.value.replace(/\D/g, ''))} />
        </div>
      </div>
      <label className="adm-check" style={{ marginBottom: 10 }}>
        <input type="checkbox" checked={secure} onChange={(e) => toggleSecure(e.target.checked)} />
        보안 연결(SSL, 포트 465) 사용
      </label>
      <div className="field">
        <label className="label" htmlFor="smtp-user">계정 (보내는 메일 주소)</label>
        <input id="smtp-user" className="input" type="email" value={user} onChange={(e) => setUser(e.target.value)} autoComplete="off" />
      </div>
      <div className="field">
        <label className="label" htmlFor="smtp-pass">앱 비밀번호</label>
        <input
          id="smtp-pass"
          className="input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={passwordSet ? '••• (바꿀 때만 입력)' : ''}
          autoComplete="new-password"
        />
      </div>
      <div className="field">
        <label className="label" htmlFor="smtp-from">보내는 사람 이름</label>
        <input id="smtp-from" className="input" value={fromName} onChange={(e) => setFromName(e.target.value)} />
      </div>
      <div className="field">
        <label className="label" htmlFor="smtp-test">테스트 메일 받을 주소</label>
        <input id="smtp-test" className="input" type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
      </div>
      {error && <Alert kind="error">{error}</Alert>}
      {done && <Alert kind="ok">{done}</Alert>}
      <button type="submit" className="btn block" disabled={busy} style={{ marginTop: 8 }}>
        {busy ? '테스트 메일 보내는 중…' : '테스트 메일 보내고 저장'}
      </button>
    </form>
  );
}
