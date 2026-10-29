// ─────────────────────────────────────────────
// A-09 출결 변경 승인. 인솔자가 올린 출결 변경 신청을 승인하거나 거절한다.
//  탭: 승인 대기(pending) / 재검토 대기(auto_rejected, 10분 초과로 우선 거절됨) / 처리 완료(done)
//  GET /api/admin/change-requests?status=...
//  POST /api/admin/change-requests/:id/approve · /reject { reason }
// 승인 대기 탭은 15초마다 자동으로 다시 불러온다.
// ─────────────────────────────────────────────
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import type { ChangeRequest } from '../../api/types';
import { ChangeRequestActions, ChangeRequestResult, RemainingChip } from '../../components/admin/ChangeRequestParts';
import { fmtDateTime, fmtTime } from '../../components/admin/format';
import { useInterval, useLoad } from '../../components/admin/hooks';
import { LoadError, PageHead, StatusChange, Tabs } from '../../components/admin/ui';

type Tab = 'pending' | 'auto_rejected' | 'done';
const TABS: { value: Tab; label: string }[] = [
  { value: 'pending', label: '승인 대기' },
  { value: 'auto_rejected', label: '재검토 대기' },
  { value: 'done', label: '처리 완료' },
];

export default function ChangeRequestsPage() {
  // 선택한 탭은 주소(?tab=)에 남겨 둔다 (대시보드에서 바로 열 수 있게)
  const [params, setParams] = useSearchParams();
  const tabParam = params.get('tab');
  const tab: Tab = tabParam === 'auto_rejected' || tabParam === 'done' ? tabParam : 'pending';

  const { data, error, loading, reload } = useLoad(() => api.get<ChangeRequest[]>(`/api/admin/change-requests?status=${tab}`), [tab]);

  useInterval(() => {
    if (tab !== 'done') void reload();
  }, 15_000);

  const rows = data ?? [];

  return (
    <>
      <PageHead title="출결 변경 승인" desc="인솔자가 신청한 출결 변경이에요. 10분 안에 답하지 않으면 우선 거절되고 재검토 대기로 옮겨져요." />
      <Tabs value={tab} onChange={(v) => setParams(v === 'pending' ? {} : { tab: v })} items={TABS} />
      {error && <LoadError message={error} onRetry={reload} />}

      <div className="table-wrap">
        <table className="table adm-table-min" style={{ minWidth: 1000 }}>
          <thead>
            <tr>
              <th scope="col">학교</th>
              <th scope="col">학생</th>
              <th scope="col">수업</th>
              <th scope="col">변경 전 → 후</th>
              <th scope="col">사유</th>
              <th scope="col">신청자</th>
              <th scope="col">{tab === 'pending' ? '남은 시간' : tab === 'auto_rejected' ? '우선 거절' : '처리 결과'}</th>
              {tab !== 'done' && <th scope="col">처리</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((cr) => (
              <tr key={cr.id}>
                <td>{cr.schoolName}</td>
                <td>
                  {cr.studentName}
                  <div className="adm-small">{cr.studentNo}</div>
                </td>
                <td>{cr.sessionLabel}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <StatusChange from={cr.fromStatus} to={cr.toStatus} />
                </td>
                <td style={{ maxWidth: 260 }}>
                  {cr.reason}
                  {cr.ticketId != null && (
                    <div>
                      <Link to={`/admin/support?id=${cr.ticketId}`} className="adm-small">
                        연결된 문의 보기
                      </Link>
                    </div>
                  )}
                </td>
                <td>
                  {cr.requestedByName}
                  <div className="adm-small">{fmtDateTime(cr.createdAt)}</div>
                </td>
                <td>
                  {cr.status === 'pending' && <RemainingChip deadlineAt={cr.deadlineAt} />}
                  {cr.status === 'auto_rejected' && <span className="adm-chip">{fmtTime(cr.autoRejectedAt)} 우선 거절</span>}
                  {tab === 'done' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <ChangeRequestResult cr={cr} />
                      <span className="adm-small">
                        {cr.decidedByName ?? '-'} · {fmtDateTime(cr.decidedAt)}
                      </span>
                      {cr.rejectReason && <span className="adm-small">사유: {cr.rejectReason}</span>}
                    </div>
                  )}
                </td>
                {tab !== 'done' && (
                  <td style={{ minWidth: 200 }}>
                    <ChangeRequestActions cr={cr} onDone={reload} compact />
                  </td>
                )}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="adm-empty">
                  {loading ? '불러오는 중…' : '해당하는 신청이 없어요.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
