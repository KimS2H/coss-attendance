// ─────────────────────────────────────────────
// 총관리자 화면 공통 부품 (팝업, 숫자 카드, 상태 배지, 알림 상자 등).
// ─────────────────────────────────────────────
import { useEffect, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { AttendanceStatus } from '../../api/types';
import { BrandWide } from '../Brand';
import { STATUS_LABEL } from './format';

/** 출석 상태 배지 (출석·지각·결석 등, 색은 styles.css 의 .badge) */
export function StatusBadge({ status }: { status: AttendanceStatus }) {
  return <span className={`badge ${status}`}>{STATUS_LABEL[status]}</span>;
}

/** "변경 전 → 변경 후" 배지 두 개 */
export function StatusChange({ from, to }: { from: AttendanceStatus; to: AttendanceStatus }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <StatusBadge status={from} />
      <span aria-hidden="true">→</span>
      <span className="sr-only">에서</span>
      <StatusBadge status={to} />
    </span>
  );
}

/** 화면 제목 + 설명 + (오른쪽) 버튼 자리 */
export function PageHead({ title, desc, children }: { title: string; desc?: ReactNode; children?: ReactNode }) {
  return (
    <div className="adm-head">
      <div>
        <h1>{title}</h1>
        {desc && <p>{desc}</p>}
      </div>
      {children && <div className="adm-row">{children}</div>}
    </div>
  );
}

/**
 * 숫자 카드. accent: 위쪽 띠 색, valueColor: 숫자 색, to: 누르면 이동할 주소(선택)
 * tone: 'warn'(노랑 배경) / 'critical'(빨강 배경)
 */
export function StatCard(props: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  accent?: string;
  valueColor?: string;
  to?: string;
  tone?: 'warn' | 'critical';
}) {
  const style = { '--accent': props.accent, '--value': props.valueColor } as CSSProperties;
  const className = `adm-stat ${props.tone ?? ''}`;
  const inner = (
    <>
      <span className="label">{props.label}</span>
      <span className="value">{props.value}</span>
      {props.hint && <span className="hint">{props.hint}</span>}
    </>
  );
  return props.to ? (
    <Link to={props.to} className={className} style={style}>
      {inner}
    </Link>
  ) : (
    <div className={className} style={style}>
      {inner}
    </div>
  );
}

/** 알림 상자. kind: error(빨강) / ok(초록) / warn(노랑) / info(파랑) */
export function Alert({ kind, children }: { kind: 'error' | 'ok' | 'warn' | 'info'; children: ReactNode }) {
  return (
    <div className={`adm-alert ${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}

/** 불러오기 실패 시 보여 주는 상자 (다시 시도 버튼 포함) */
export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="adm-alert error" role="alert" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
      <span style={{ flex: 1 }}>{message}</span>
      <button type="button" className="btn secondary sm" onClick={onRetry}>
        다시 시도
      </button>
    </div>
  );
}

/** 탭 버튼 묶음 */
export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: ReactNode }[] }) {
  return (
    <div className="adm-tabs" role="tablist">
      {items.map((it) => (
        <button
          key={it.value}
          type="button"
          role="tab"
          aria-selected={value === it.value}
          className={`adm-tab ${value === it.value ? 'active' : ''}`}
          onClick={() => onChange(it.value)}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

/** 팝업 창. Esc 키나 바깥(어두운 곳)을 누르면 닫힌다 */
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="adm-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="adm-modal" role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

/**
 * 사유 입력 팝업 (미승인·거절 등). 사유는 반드시 입력해야 한다.
 * onSubmit 이 오류를 던지면 팝업 안에 오류 문장을 보여 준다.
 */
export function ReasonModal(props: {
  title: string;
  desc?: ReactNode;
  confirmLabel: string;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
  errorText: (e: unknown) => string;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!reason.trim()) {
      setError('사유를 입력해 주세요.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await props.onSubmit(reason.trim());
    } catch (err) {
      setError(props.errorText(err));
      setBusy(false);
    }
  }

  return (
    <Modal title={props.title} onClose={props.onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {props.desc && <p className="adm-help">{props.desc}</p>}
        <div className="field" style={{ marginBottom: 0 }}>
          <label className="label" htmlFor="reason-input">
            사유 (필수)
          </label>
          <textarea id="reason-input" className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus maxLength={500} />
        </div>
        {error && <Alert kind="error">{error}</Alert>}
        <div className="adm-row end">
          <button type="button" className="btn secondary" onClick={props.onClose} disabled={busy}>
            취소
          </button>
          <button type="submit" className="btn danger" disabled={busy}>
            {busy ? '처리 중…' : props.confirmLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** 첫 설정·로그인 화면 틀: 남색 상단 막대 + 가운데 카드 */
export function CenterShell({ children }: { children: ReactNode }) {
  return (
    <div className="adm-page">
      <div className="adm-topbar">
        <span className="adm-brand">
          <BrandWide />
          <span className="adm-role-chip">총관리자</span>
        </span>
      </div>
      <div className="adm-center">
        <div className="card">{children}</div>
      </div>
    </div>
  );
}
