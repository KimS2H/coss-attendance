// ─────────────────────────────────────────────
// A-08 관리자 대시보드. GET /api/admin/dashboard 한 번으로 모든 카드·목록을 받는다.
// 15초마다 자동으로 다시 불러온다.
//  - 위: 숫자 카드 8개 (출석률, 승인 대기, 재검토, 문의, 대리 출석, 기기, 시스템)
//  - 출결 변경 승인 대기 목록 (남은 시간이 1초마다 줄어듦, 승인/미승인)
//  - 재검토 대기 목록 (10분 초과로 우선 거절된 신청, 승인/거절 확정)
//  - 관리자가 처리할 문의, 학교별 오늘 현황 표
// ─────────────────────────────────────────────
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import type { Dashboard, Ticket } from '../../api/types';
import { ChangeRequestItem } from '../../components/admin/ChangeRequestParts';
import { fmtNowLabel, fmtTime, TICKET_STATUS_LABEL } from '../../components/admin/format';
import { useInterval, useLoad } from '../../components/admin/hooks';
import { LoadError, PageHead, StatCard } from '../../components/admin/ui';

const SYSTEM_LABEL = { ok: '정상', warning: '경고', critical: '장애' } as const;

export default function DashboardPage() {
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const { data, error, reload } = useLoad(async () => {
    const d = await api.get<Dashboard>('/api/admin/dashboard');
    setLoadedAt(new Date());
    return d;
  }, []);

  // 15초마다 자동 새로고침
  useInterval(() => void reload(), 15_000);

  if (!data) {
    return error ? <LoadError message={error} onRetry={reload} /> : <p className="adm-empty">불러오는 중…</p>;
  }

  const d = data;
  const escalated = d.adminTickets.filter((t) => t.reporterType === 'student').length;
  const staffAsked = d.adminTickets.length - escalated;

  return (
    <>
      <PageHead
        title="관리자 대시보드"
        desc={`${loadedAt ? fmtNowLabel(loadedAt) : d.date} 기준 · 참여 학교 ${d.schools.length}곳 · 15초마다 자동 새로고침`}
      >
        <button type="button" className="btn secondary sm" onClick={() => void reload()}>
          지금 새로고침
        </button>
      </PageHead>
      {/* 자동 새로고침 실패 시: 이전 데이터는 그대로 두고 오류만 알려 준다 */}
      {error && <LoadError message={`최신 정보를 불러오지 못했어요: ${error}`} onRetry={reload} />}

      {/* ── 숫자 카드 ── */}
      <div className="adm-stats">
        <StatCard
          label="오늘 출석률"
          value={`${Math.round(d.attendanceRate.percent)}%`}
          hint={`지각 포함 ${d.attendanceRate.attended} / ${d.attendanceRate.total}명`}
          to="/admin/attendance"
        />
        <StatCard
          label="출결 변경 승인 대기"
          value={d.pendingChangeRequests.length}
          hint="10분 안에 답하지 않으면 우선 거절"
          accent="#1E3A8A"
          valueColor="#1E3A8A"
          to="/admin/change-requests"
        />
        <StatCard
          label="재검토 대기"
          value={d.reviewChangeRequests.length}
          hint="10분 초과로 우선 거절된 신청"
          accent="#64748B"
          valueColor="#334155"
          to="/admin/change-requests?tab=auto_rejected"
        />
        <StatCard
          label="관리자 처리 문의"
          value={d.adminTickets.length}
          hint={`이관 ${escalated} · 인솔자 문의 ${staffAsked}`}
          accent="#DC2626"
          valueColor="#991B1B"
          to="/admin/support"
        />
        <StatCard label="인솔자가 처리 중인 문의" value={d.staffOpenTickets} hint="학교 인솔자가 답하는 중" accent="#D97706" valueColor="#92400E" to="/admin/support?scope=all" />
        <StatCard
          label="대리 출석 감지"
          value={d.proxyCanceledToday}
          hint="주인 아닌 계정 자동 출석 취소"
          accent="#B91C1C"
          valueColor="#991B1B"
          to="/admin/attendance?status=canceled"
        />
        <StatCard
          label="기기 승인 대기"
          value={d.pendingDeviceApprovals}
          hint={`동일기기 의심 ${d.suspiciousToday}`}
          accent="#4F46E5"
          valueColor="#3730A3"
          to="/admin/devices"
        />
        <StatCard
          label="시스템 상태"
          value={SYSTEM_LABEL[d.system.status]}
          hint={d.system.message}
          accent={d.system.status === 'ok' ? '#16A34A' : d.system.status === 'warning' ? '#F59E0B' : '#DC2626'}
          valueColor={d.system.status === 'ok' ? '#166534' : d.system.status === 'warning' ? '#92400E' : '#991B1B'}
          tone={d.system.status === 'warning' ? 'warn' : d.system.status === 'critical' ? 'critical' : undefined}
        />
      </div>

      {/* ── 출결 변경 승인 대기 ── */}
      <section className="adm-section" aria-label="출결 변경 승인 대기">
        <div className="adm-section-head">
          <h2>출결 변경 승인 대기</h2>
          <span className="desc">승인하면 바로 반영되고 인솔자·학생에게 알림이 가요</span>
        </div>
        {d.pendingChangeRequests.length === 0 ? (
          <p className="adm-empty">기다리는 신청이 없어요.</p>
        ) : (
          d.pendingChangeRequests.map((cr) => <ChangeRequestItem key={cr.id} cr={cr} onDone={reload} />)
        )}
      </section>

      {/* ── 재검토 대기 ── */}
      <section className="adm-section" aria-label="재검토 대기">
        <div className="adm-section-head">
          <h2>재검토 대기</h2>
          <span className="desc">10분 안에 답하지 못해 우선 거절된 신청이에요. 지금 승인하면 반영돼요.</span>
        </div>
        {d.reviewChangeRequests.length === 0 ? (
          <p className="adm-empty">재검토할 신청이 없어요.</p>
        ) : (
          d.reviewChangeRequests.map((cr) => <ChangeRequestItem key={cr.id} cr={cr} onDone={reload} />)
        )}
      </section>

      <div className="adm-grid-2">
        {/* ── 관리자가 처리할 문의 ── */}
        <section className="adm-section" aria-label="관리자가 처리할 문의">
          <div className="adm-section-head">
            <h2>관리자가 처리할 문의</h2>
            <Link to="/admin/support" style={{ fontSize: 14 }}>
              문의·오류 화면으로
            </Link>
          </div>
          {d.adminTickets.length === 0 ? <p className="adm-empty">처리할 문의가 없어요.</p> : d.adminTickets.map((t) => <TicketItem key={t.id} t={t} />)}
        </section>

        {/* ── 학교별 오늘 현황 ── */}
        <section className="adm-section" aria-label="학교별 오늘 현황">
          <h2>학교별 오늘 현황</h2>
          <div className="table-wrap">
            <table className="table" style={{ minWidth: 420 }}>
              <thead>
                <tr>
                  <th scope="col">학교</th>
                  <th scope="col">출석률</th>
                  <th scope="col">미출</th>
                  <th scope="col">의심</th>
                  <th scope="col">미해결 문의</th>
                </tr>
              </thead>
              <tbody>
                {d.schools.map((s) => (
                  <tr key={s.schoolId}>
                    <td style={{ fontWeight: 500 }}>
                      <Link to={`/admin/attendance?schoolId=${s.schoolId}`}>{s.schoolName}</Link>
                    </td>
                    <td>{Math.round(s.percent)}%</td>
                    <td>{s.none}</td>
                    <td style={s.suspicious > 0 ? { color: '#991B1B', fontWeight: 700 } : undefined}>{s.suspicious}</td>
                    <td>{s.openTickets}</td>
                  </tr>
                ))}
                {d.schools.length === 0 && (
                  <tr>
                    <td colSpan={5} className="adm-empty">
                      등록된 학교가 없어요.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Link to="/admin/support?scope=all" style={{ fontSize: 14 }}>
            전체 문의 로그 보기 (학생·인솔자 모두)
          </Link>
        </section>
      </div>
    </>
  );
}

/** 관리자 처리 문의 한 건 (누르면 문의 화면에서 열림) */
function TicketItem({ t }: { t: Ticket }) {
  const escalated = t.reporterType === 'student';
  return (
    <Link to={`/admin/support?id=${t.id}`} className={`adm-item ${escalated ? 'danger' : ''}`} style={{ textDecoration: 'none', color: 'inherit' }}>
      <div className="adm-item-body">
        <p className="line" style={{ justifyContent: 'space-between' }}>
          <strong>
            {t.category} · {t.schoolName} {t.reporterName}
          </strong>
          <span className={`adm-chip ${escalated ? 'danger' : 'info'}`}>{escalated ? '인솔자 이관' : '인솔자 문의'}</span>
        </p>
        <span style={{ fontSize: 13, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.content}</span>
        <span className="adm-small">
          접수 {fmtTime(t.createdAt)} · {TICKET_STATUS_LABEL[t.status]}
        </span>
      </div>
    </Link>
  );
}
