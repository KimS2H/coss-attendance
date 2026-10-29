// L-08 기기 승인.
// 등록되지 않은 기기로 출석한 학생 목록. 승인하면 "승인한 시각" 기준으로 출석·지각·결석이 정해진다.
// 탭: 승인 대기(status=pending) / 처리 완료(status=done)
import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from '../../api/client';
import type { DeviceApproval, DeviceDecision } from '../../api/types';
import { fmtDateTime } from '../../components/format';
import { useInterval } from '../../components/hooks';
import { Modal } from '../../components/Modal';
import { useStaff } from './context';

type Tab = 'pending' | 'done';

export default function DevicesPage() {
  const { canEdit, refreshCounts } = useStaff();
  const [tab, setTab] = useState<Tab>('pending');
  const [list, setList] = useState<DeviceApproval[] | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [rejecting, setRejecting] = useState<DeviceApproval | null>(null);

  const load = useCallback(async () => {
    try {
      setList(await api.get<DeviceApproval[]>(`/api/staff/device-approvals?status=${tab}`));
      setError('');
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [tab]);

  useEffect(() => {
    setList(null);
    void load();
  }, [load]);
  // 승인 대기는 15초마다 새로 고침 (새 요청이 계속 들어올 수 있음)
  useInterval(() => void load(), tab === 'pending' ? 15_000 : null);

  async function approve(d: DeviceApproval) {
    setBusyId(d.id);
    setNotice('');
    setError('');
    try {
      const res = await api.post<DeviceDecision>(`/api/staff/device-approvals/${d.id}/approve`, {});
      setNotice(`${d.studentName}(${d.studentNo}): ${res.message}`);
      void load();
      refreshCounts();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <div>
        <h1 className="sf-title">기기 승인 요청</h1>
        <p className="sf-sub">등록되지 않은 기기로 출석한 학생이에요. 위치와 코드는 이미 확인됐어요.</p>
      </div>

      <div className="sf-info" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 24px' }}>
        <strong>승인한 시각 기준으로 판정</strong>
        <span>
          시작 5분 후까지 승인 → <strong style={{ color: 'var(--present-text)' }}>출석</strong>
        </span>
        <span>
          수업 종료 전 승인 → <strong style={{ color: 'var(--late-text)' }}>지각</strong>
        </span>
        <span>
          수업 종료 후 승인 → <strong style={{ color: '#991b1b' }}>결석 유지</strong> (기기만 등록)
        </span>
      </div>

      <div className="sf-tabs" role="tablist" aria-label="기기 승인 구분">
        <button type="button" role="tab" aria-selected={tab === 'pending'} onClick={() => setTab('pending')}>
          승인 대기
        </button>
        <button type="button" role="tab" aria-selected={tab === 'done'} onClick={() => setTab('done')}>
          처리 완료
        </button>
      </div>

      {error && <p className="sf-alert">{error}</p>}
      {notice && <p className="sf-ok">{notice}</p>}
      {list === null && <p className="sf-empty">불러오는 중…</p>}
      {list?.length === 0 && <p className="sf-empty">{tab === 'pending' ? '승인을 기다리는 요청이 없어요.' : '처리한 요청이 없어요.'}</p>}

      {/* 승인 대기: 카드 */}
      {tab === 'pending' &&
        list?.map((d) => (
          <section key={d.id} className="sf-device-card" aria-label={`${d.studentName} 기기 승인 요청`}>
            <div className="sf-kv">
              <div>
                <span>학생</span>
                <b style={{ fontSize: 16, fontWeight: 700 }}>
                  {d.studentName} ({d.studentNo})
                </b>
              </div>
              <div>
                <span>수업</span>
                <b>{d.sessionLabel}</b>
              </div>
              <div>
                <span>요청 시각</span>
                <b>{fmtDateTime(d.requestedAt)}</b>
              </div>
              <div>
                <span>새 기기</span>
                <b style={{ fontSize: 13 }}>{d.userAgent ?? '-'}</b>
              </div>
              <div>
                <span>거리</span>
                <b>{d.distanceM !== null ? `${d.distanceM}m` : '-'}</b>
              </div>
            </div>

            <div style={{ flex: '1 1 260px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {d.ownerName && (
                <p className="sf-alert" role="alert" style={{ fontWeight: 700 }}>
                  다른 학생({d.ownerName})의 등록 기기예요
                </p>
              )}
              {canEdit ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
                  <button type="button" className="btn secondary" disabled={busyId === d.id} onClick={() => setRejecting(d)}>
                    거절
                  </button>
                  <button type="button" className="btn" disabled={busyId === d.id} onClick={() => void approve(d)}>
                    {busyId === d.id ? '처리 중…' : '승인'}
                  </button>
                </div>
              ) : (
                <p className="sf-sub" style={{ margin: 0 }}>
                  보기 권한이라 승인할 수 없어요.
                </p>
              )}
              <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)', textAlign: 'center', lineHeight: 1.5 }}>
                승인하면 승인한 시각 기준으로 출석·지각이 정해져요. 수업이 끝난 뒤 승인하면 결석이에요.
              </p>
            </div>
          </section>
        ))}

      {/* 처리 완료: 표 */}
      {tab === 'done' && list && list.length > 0 && (
        <div className="table-wrap">
          <table className="table" style={{ minWidth: 760 }}>
            <thead>
              <tr>
                <th scope="col">처리 시각</th>
                <th scope="col">학생</th>
                <th scope="col">수업</th>
                <th scope="col">결과</th>
                <th scope="col">처리자</th>
                <th scope="col">사유</th>
              </tr>
            </thead>
            <tbody>
              {list.map((d) => (
                <tr key={d.id}>
                  <td>{fmtDateTime(d.decidedAt)}</td>
                  <td>
                    {d.studentName} ({d.studentNo})
                  </td>
                  <td>{d.sessionLabel}</td>
                  <td>
                    {d.status === 'approved' ? (
                      <span className="badge present">승인</span>
                    ) : d.status === 'rejected' ? (
                      <span className="badge absent">거절 → 결석</span>
                    ) : (
                      <span className="badge pending_device">대기</span>
                    )}
                  </td>
                  <td>{d.decidedByName ?? '-'}</td>
                  <td style={{ color: d.rejectReason ? undefined : 'var(--muted)' }}>{d.rejectReason ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rejecting && (
        <RejectModal
          approval={rejecting}
          onClose={() => setRejecting(null)}
          onDone={(msg) => {
            setRejecting(null);
            setNotice(msg);
            void load();
            refreshCounts();
          }}
        />
      )}
    </>
  );
}

/** 거절 사유 입력 창 */
function RejectModal({ approval, onClose, onDone }: { approval: DeviceApproval; onClose: () => void; onDone: (msg: string) => void }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason.trim()) return setError('거절 사유를 입력하세요.');
    setBusy(true);
    setError('');
    try {
      const res = await api.post<DeviceDecision>(`/api/staff/device-approvals/${approval.id}/reject`, { reason: reason.trim() });
      onDone(`${approval.studentName}(${approval.studentNo}): ${res.message}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Modal title={`기기 승인 거절 · ${approval.studentName}(${approval.studentNo})`} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <div className="field">
          <label className="label" htmlFor="rj-reason">
            거절 사유 (필수)
          </label>
          <input id="rj-reason" className="input" autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="예: 본인 확인 불가" />
        </div>
        <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--muted)' }}>거절하면 이 수업은 결석으로 처리돼요.</p>
        {error && <p className="sf-alert" style={{ marginBottom: 12 }}>{error}</p>}
        <div className="sf-actions">
          <button type="button" className="btn secondary" onClick={onClose}>
            취소
          </button>
          <button type="submit" className="btn danger" disabled={busy}>
            {busy ? '처리 중…' : '거절'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
