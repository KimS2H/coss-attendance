// 출결 변경 신청 입력 (출석 현황 표의 버튼, 문의함에서 같이 쓴다).
// 인솔자는 "신청"만 하고, 총관리자가 승인해야 실제로 바뀐다.
// POST /api/staff/change-requests
import { useState } from 'react';
import { api, errorMessage } from '../../api/client';
import type { AttendanceStatus, ChangeRequest, NewChangeRequest } from '../../api/types';
import { STATUS_LABEL } from '../../components/format';
import { Modal } from '../../components/Modal';

type ToStatus = NewChangeRequest['toStatus'];
const TO_OPTIONS: ToStatus[] = ['present', 'late', 'excused', 'absent'];

export const CHANGE_NOTE = '총관리자가 10분 안에 답하지 않으면 우선 거절되고, 나중에 다시 확인해요';

type Props = {
  studentId: number;
  sessionId: number;
  fromStatus?: AttendanceStatus; // 지금 상태 (모르면 비워 둠)
  ticketId?: number | null; // 문의에서 신청할 때 그 문의 번호
  onDone: (cr: ChangeRequest) => void;
  onCancel?: () => void;
  submitLabel?: string;
};

/** 입력 칸 묶음 (창 없이 화면 안에 바로 넣을 때) */
export function ChangeRequestForm({ studentId, sessionId, fromStatus, ticketId, onDone, onCancel, submitLabel = '변경 신청' }: Props) {
  const [toStatus, setToStatus] = useState<ToStatus>('present');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!reason.trim()) return setError('사유를 입력하세요.');
    const body: NewChangeRequest = { studentId, sessionId, toStatus, reason: reason.trim(), ticketId: ticketId ?? null };
    setBusy(true);
    try {
      const cr = await api.post<ChangeRequest>('/api/staff/change-requests', body);
      setReason('');
      onDone(cr);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
        {fromStatus && (
          <div className="field" style={{ margin: 0 }}>
            <span className="label">현재</span>
            <span className={`badge ${fromStatus}`} style={{ minHeight: 44, padding: '0 14px', fontSize: 14 }}>
              {STATUS_LABEL[fromStatus]}
            </span>
          </div>
        )}
        <div className="field" style={{ margin: 0, flex: '0 1 160px' }}>
          <label className="label" htmlFor="cr-to">
            변경 후
          </label>
          <select id="cr-to" className="select" value={toStatus} onChange={(e) => setToStatus(e.target.value as ToStatus)}>
            {TO_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ margin: 0, flex: '1 1 240px' }}>
          <label className="label" htmlFor="cr-reason">
            사유 (필수)
          </label>
          <input
            id="cr-reason"
            className="input"
            type="text"
            placeholder="예: 강의실 내 GPS 오차, 인솔자가 현장에서 확인"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
      </div>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>{CHANGE_NOTE}</p>
      {error && <p className="sf-alert">{error}</p>}
      <div className="sf-actions">
        {onCancel && (
          <button type="button" className="btn secondary" onClick={onCancel}>
            취소
          </button>
        )}
        <button type="submit" className="btn" disabled={busy}>
          {busy ? '보내는 중…' : submitLabel}
        </button>
      </div>
    </form>
  );
}

/** 창(모달)으로 띄우는 출결 변경 신청 */
export function ChangeRequestModal(props: Props & { title: string; onCancel: () => void }) {
  return (
    <Modal title={props.title} onClose={props.onCancel} width={600}>
      <ChangeRequestForm {...props} />
    </Modal>
  );
}
