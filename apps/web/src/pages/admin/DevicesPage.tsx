// ─────────────────────────────────────────────
// 기기 승인 (전체 학교). 등록되지 않은 기기로 출석한 학생을 승인/거절한다.
// 보통은 학교 인솔자가 처리하지만, 총관리자도 모든 학교 건을 처리할 수 있다.
//  GET  /api/admin/device-approvals?status=pending|done
//  POST /api/admin/device-approvals/:id/approve        → DeviceDecision (승인 시각 기준 출석/지각/결석)
//  POST /api/admin/device-approvals/:id/reject {reason} → DeviceDecision
// ─────────────────────────────────────────────
import { useState } from 'react';
import { api } from '../../api/client';
import type { DeviceApproval, DeviceDecision } from '../../api/types';
import { adminError, fmtDateTime } from '../../components/admin/format';
import { useInterval, useLoad } from '../../components/admin/hooks';
import { Alert, LoadError, PageHead, ReasonModal, Tabs } from '../../components/admin/ui';

type Tab = 'pending' | 'done';

export default function DevicesPage() {
  const [tab, setTab] = useState<Tab>('pending');
  const [notice, setNotice] = useState<string | null>(null); // 처리 결과 안내 (서버 message)
  const { data, error, loading, reload } = useLoad(() => api.get<DeviceApproval[]>(`/api/admin/device-approvals?status=${tab}`), [tab]);
  useInterval(() => {
    if (tab === 'pending') void reload();
  }, 15_000);

  const rows = data ?? [];

  return (
    <>
      <PageHead title="기기 승인" desc="등록되지 않은 기기로 출석한 학생이에요. 위치와 코드는 이미 확인됐어요." />

      {/* 판정 규칙 안내 */}
      <div className="adm-alert info" style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 20px' }}>
        <strong>승인한 시각 기준으로 판정</strong>
        <span>시작 5분 후까지 승인 → 출석</span>
        <span>수업 종료 전 승인 → 지각</span>
        <span>수업 종료 후 승인 → 결석 유지 (기기만 등록)</span>
      </div>

      <Tabs
        value={tab}
        onChange={(v) => {
          setTab(v);
          setNotice(null);
        }}
        items={[
          { value: 'pending', label: '대기 중' },
          { value: 'done', label: '처리 이력' },
        ]}
      />
      {notice && <Alert kind="ok">{notice}</Alert>}
      {error && <LoadError message={error} onRetry={reload} />}

      {tab === 'pending' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {rows
            .filter((r) => r.status === 'pending')
            .map((r) => (
              <PendingCard
                key={r.id}
                r={r}
                onDecided={(msg) => {
                  setNotice(msg);
                  void reload();
                }}
              />
            ))}
          {rows.length === 0 && <p className="adm-empty card">{loading ? '불러오는 중…' : '대기 중인 기기 승인 요청이 없어요.'}</p>}
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table adm-table-min">
            <thead>
              <tr>
                <th scope="col">처리 시각</th>
                <th scope="col">학교</th>
                <th scope="col">학생</th>
                <th scope="col">수업</th>
                <th scope="col">결과</th>
                <th scope="col">처리자</th>
                <th scope="col">사유</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(r.decidedAt)}</td>
                  <td>{r.schoolName}</td>
                  <td>
                    {r.studentName} ({r.studentNo})
                  </td>
                  <td>{r.sessionLabel}</td>
                  <td>
                    <span className={`adm-chip ${r.status === 'approved' ? 'ok' : r.status === 'rejected' ? 'danger' : 'warn'}`}>
                      {r.status === 'approved' ? '승인' : r.status === 'rejected' ? '거절' : '대기'}
                    </span>
                  </td>
                  <td>{r.decidedByName ?? '-'}</td>
                  <td>{r.rejectReason ?? '-'}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="adm-empty">
                    {loading ? '불러오는 중…' : '처리 이력이 없어요.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/** 대기 중인 요청 한 건: 학생·수업·기기 정보, (다른 학생 기기면) 경고, 승인/거절 버튼 */
function PendingCard({ r, onDecided }: { r: DeviceApproval; onDecided: (message: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);

  async function approve() {
    const extra = r.ownerName ? `\n\n주의: 이 기기는 ${r.ownerName} 학생의 등록 기기예요.` : '';
    if (!window.confirm(`${r.studentName}(${r.studentNo}) 학생의 기기를 승인할까요?${extra}`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<DeviceDecision>(`/api/admin/device-approvals/${r.id}/approve`, {});
      onDecided(res.message);
    } catch (e) {
      setError(adminError(e));
      setBusy(false);
    }
  }

  return (
    <div className={`adm-item ${r.ownerName ? 'danger' : ''}`}>
      <div className="adm-item-body">
        <p className="title">
          {r.studentName} ({r.studentNo}) · {r.schoolName}
        </p>
        <dl className="adm-kv">
          <dt>수업</dt>
          <dd>{r.sessionLabel}</dd>
          <dt>요청 시각</dt>
          <dd>{fmtDateTime(r.requestedAt)}</dd>
          <dt>새 기기</dt>
          <dd>{r.userAgent ?? '-'}</dd>
          <dt>거리</dt>
          <dd>{r.distanceM != null ? `${Math.round(r.distanceM)}m` : '-'}</dd>
        </dl>
        {/* 이 기기가 다른 학생의 등록 기기이면 대리 출석일 수 있으므로 경고 */}
        {r.ownerName && (
          <Alert kind="error">
            <strong>⚠ 이 기기는 {r.ownerName} 학생의 등록 기기예요.</strong>
            <br />
            대리 출석일 수 있어요. 본인 확인 후 승인하세요.
          </Alert>
        )}
        {error && <span className="error-text">{error}</span>}
      </div>
      <div className="adm-item-actions">
        <button type="button" className="btn secondary" disabled={busy} onClick={() => setRejectOpen(true)}>
          거절
        </button>
        <button type="button" className="btn" disabled={busy} onClick={approve}>
          {busy ? '처리 중…' : '승인'}
        </button>
      </div>
      {rejectOpen && (
        <ReasonModal
          title="기기 승인 거절"
          desc={`${r.studentName}(${r.studentNo}) · ${r.sessionLabel}. 거절하면 이 수업은 결석으로 처리돼요.`}
          confirmLabel="거절"
          errorText={adminError}
          onClose={() => setRejectOpen(false)}
          onSubmit={async (reason) => {
            const res = await api.post<DeviceDecision>(`/api/admin/device-approvals/${r.id}/reject`, { reason });
            setRejectOpen(false);
            onDecided(res.message);
          }}
        />
      )}
    </div>
  );
}
