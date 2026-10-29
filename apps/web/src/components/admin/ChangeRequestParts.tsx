// ─────────────────────────────────────────────
// 출결 변경 신청(인솔자가 올린 것) 관련 부품.
//  - RemainingChip: 우선 거절까지 남은 시간 (1초마다 줄어듦)
//  - ChangeRequestActions: 승인 / 미승인(거절 확정) 버튼 + 사유 팝업
//  - ChangeRequestItem: 대시보드용 카드 한 줄
// 신청 후 10분 안에 답하지 않으면 서버가 "우선 거절"(auto_rejected)로 바꾼다.
// 우선 거절된 신청도 같은 API(approve/reject)로 승인하거나 거절을 확정할 수 있다.
// ─────────────────────────────────────────────
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import type { ChangeRequest } from '../../api/types';
import { adminError, CR_STATUS_LABEL, fmtDateTime, fmtRemaining, fmtTime } from './format';
import { useNow } from './hooks';
import { ReasonModal, StatusChange } from './ui';

/** 우선 거절까지 남은 시간 칩. 3분 미만이면 빨강, 지나면 "곧 우선 거절" */
export function RemainingChip({ deadlineAt }: { deadlineAt: string }) {
  const now = useNow(1000);
  const left = new Date(deadlineAt).getTime() - now;
  if (left <= 0) return <span className="adm-chip danger">곧 우선 거절</span>;
  return <span className={`adm-chip ${left < 3 * 60_000 ? 'danger' : 'warn'}`}>남은 시간 {fmtRemaining(left)}</span>;
}

/** 처리 결과 칩 (처리 완료 목록용) */
export function ChangeRequestResult({ cr }: { cr: ChangeRequest }) {
  const tone = cr.status === 'approved' ? 'ok' : cr.status === 'pending' ? 'warn' : 'danger';
  return <span className={`adm-chip ${tone}`}>{CR_STATUS_LABEL[cr.status]}</span>;
}

/**
 * 승인 / 미승인 버튼.
 * 승인 대기(pending)면 "미승인", 재검토 대기(auto_rejected)면 "거절 확정" 이라고 쓴다.
 * 처리가 끝나면 onDone 을 불러 부모 화면이 목록을 다시 불러오게 한다.
 */
export function ChangeRequestActions({ cr, onDone, compact }: { cr: ChangeRequest; onDone: () => void; compact?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);

  if (cr.status !== 'pending' && cr.status !== 'auto_rejected') return null;
  const rejectLabel = cr.status === 'pending' ? '미승인' : '거절 확정';

  async function approve() {
    setBusy(true);
    setError(null);
    try {
      await api.post<ChangeRequest>(`/api/admin/change-requests/${cr.id}/approve`, {});
      onDone();
    } catch (e) {
      setError(adminError(e));
    } finally {
      setBusy(false);
    }
  }

  const btnClass = compact ? 'btn sm' : 'btn';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div className="adm-item-actions" style={{ flex: 'none' }}>
        <button type="button" className={`${btnClass} secondary`} disabled={busy} onClick={() => setRejectOpen(true)}>
          {rejectLabel}
        </button>
        <button type="button" className={btnClass} disabled={busy} onClick={approve}>
          {busy ? '처리 중…' : '승인'}
        </button>
      </div>
      {error && <span className="error-text">{error}</span>}
      {rejectOpen && (
        <ReasonModal
          title={`${rejectLabel} 사유`}
          desc={
            <>
              {cr.studentName}({cr.studentNo}) · {cr.sessionLabel}
              <br />
              사유는 처리 기록에 남고 신청한 인솔자가 볼 수 있어요.
            </>
          }
          confirmLabel={rejectLabel}
          errorText={adminError}
          onClose={() => setRejectOpen(false)}
          onSubmit={async (reason) => {
            await api.post<ChangeRequest>(`/api/admin/change-requests/${cr.id}/reject`, { reason });
            setRejectOpen(false);
            onDone();
          }}
        />
      )}
    </div>
  );
}

/** 대시보드용 카드 한 줄: 학생·학교·수업, 변경 전→후, 신청자, 남은 시간, 사유, 버튼 */
export function ChangeRequestItem({ cr, onDone }: { cr: ChangeRequest; onDone: () => void }) {
  return (
    <div className={`adm-item ${cr.status === 'auto_rejected' ? 'muted' : ''}`}>
      <div className="adm-item-body">
        <p className="title">
          {cr.studentName} ({cr.studentNo}) · {cr.schoolName} · {cr.sessionLabel}
        </p>
        <p className="line">
          <StatusChange from={cr.fromStatus} to={cr.toStatus} />
          <span className="meta">
            신청 {cr.requestedByName} · {fmtTime(cr.createdAt)}
            {cr.ticketId != null && (
              <>
                {' · '}
                <Link to={`/admin/support?id=${cr.ticketId}`}>연결된 문의 보기</Link>
              </>
            )}
          </span>
          {cr.status === 'pending' && <RemainingChip deadlineAt={cr.deadlineAt} />}
        </p>
        <p className="meta" style={{ margin: 0, color: 'var(--text-2)' }}>
          사유: {cr.reason}
        </p>
        {cr.status === 'auto_rejected' && (
          <span className="adm-small">
            신청 {fmtDateTime(cr.createdAt)} → {fmtTime(cr.autoRejectedAt)} 우선 거절 (10분 초과)
          </span>
        )}
      </div>
      <div style={{ flex: '0 1 240px' }}>
        <ChangeRequestActions cr={cr} onDone={onDone} />
      </div>
    </div>
  );
}
