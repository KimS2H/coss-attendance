// ─────────────────────────────────────────────
// A-02 전체 출석 현황. 인솔자 출석 현황과 같지만 모든 학교를 볼 수 있다.
//  필터: 날짜, 수업(그날 일정), 학교, 상태, 검색(학번·이름)
//  GET /api/admin/attendance?date=&sessionId=&schoolId=&status=&q=
//  다운로드: /api/admin/attendance/export?...&format=xlsx|csv (같은 필터)
// 주소 뒤에 ?schoolId=1 이나 ?status=canceled 를 붙여 열 수도 있다 (대시보드 링크).
// ─────────────────────────────────────────────
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import type { AdminSchool, AdminSession, AttendanceList } from '../../api/types';
import { fmtTime, todayKST } from '../../components/admin/format';
import { useDebounced, useInterval, useLoad } from '../../components/admin/hooks';
import { LoadError, PageHead, StatCard, StatusBadge } from '../../components/admin/ui';

// 상태 필터 목록 (값은 서버로 보내는 status)
const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '전체' },
  { value: 'present', label: '출석' },
  { value: 'late', label: '지각' },
  { value: 'absent', label: '결석' },
  { value: 'none', label: '미출' },
  { value: 'pending_device', label: '승인 대기' },
  { value: 'excused', label: '공결' },
  { value: 'canceled', label: '출석 취소' },
  { value: 'suspicious', label: '동일기기 의심' },
];

export default function AttendancePage() {
  const [params] = useSearchParams();
  // 필터 값들 (처음 값은 주소의 ?schoolId= / ?status= 를 따른다)
  const [date, setDate] = useState(todayKST());
  const [sessionId, setSessionId] = useState('');
  const [schoolId, setSchoolId] = useState(params.get('schoolId') ?? '');
  const [status, setStatus] = useState(params.get('status') ?? '');
  const [q, setQ] = useState('');
  const qDebounced = useDebounced(q.trim(), 300);

  // 학교 목록 (필터용)
  const schools = useLoad(() => api.get<AdminSchool[]>('/api/admin/schools'), []);
  // 고른 날짜의 수업 목록 (필터용)
  const sessions = useLoad(() => api.get<AdminSession[]>(`/api/admin/sessions?from=${date}&to=${date}`), [date]);

  // 서버로 보낼 조건 (빈 값은 빼고)
  const query = useMemo(() => {
    const p = new URLSearchParams({ date });
    if (sessionId) p.set('sessionId', sessionId);
    if (schoolId) p.set('schoolId', schoolId);
    if (status) p.set('status', status);
    if (qDebounced) p.set('q', qDebounced);
    return p.toString();
  }, [date, sessionId, schoolId, status, qDebounced]);

  const list = useLoad(() => api.get<AttendanceList>(`/api/admin/attendance?${query}`), [query]);
  // 수업 중에는 출석이 계속 들어오므로 30초마다 새로고침
  useInterval(() => void list.reload(), 30_000);

  const rows = list.data?.rows ?? [];
  const s = list.data?.summary;
  const sortedSessions = [...(sessions.data ?? [])].sort((a, b) => a.period - b.period);

  return (
    <>
      <PageHead title="전체 출석 현황" desc="모든 학교의 출석 기록이에요. 출결 변경은 인솔자 신청 → 총관리자 승인으로 반영돼요." />

      {/* ── 필터 ── */}
      <div className="adm-filters">
        <div className="field">
          <label className="label" htmlFor="f-date">날짜</label>
          <input
            id="f-date"
            type="date"
            className="input"
            value={date}
            onChange={(e) => {
              setDate(e.target.value || todayKST());
              setSessionId(''); // 날짜가 바뀌면 수업 선택 초기화
            }}
          />
        </div>
        <div className="field wide">
          <label className="label" htmlFor="f-session">수업</label>
          <select id="f-session" className="select" value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
            <option value="">전체 수업</option>
            {sortedSessions.map((ss) => (
              <option key={ss.id} value={ss.id}>
                {ss.period}교시 {ss.courseName} ({ss.locationName}, {ss.startTime}–{ss.endTime})
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="label" htmlFor="f-school">학교</label>
          <select id="f-school" className="select" value={schoolId} onChange={(e) => setSchoolId(e.target.value)}>
            <option value="">전체 학교</option>
            {(schools.data ?? []).map((sc) => (
              <option key={sc.id} value={sc.id}>
                {sc.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="label" htmlFor="f-status">상태</label>
          <select id="f-status" className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field wide">
          <label className="label" htmlFor="f-q">검색</label>
          <input id="f-q" type="search" className="input" placeholder="학번 또는 이름" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {list.error && <LoadError message={list.error} onRetry={list.reload} />}

      {/* ── 요약 숫자 ── */}
      <div className="adm-stats small">
        <StatCard label="전체" value={s?.total ?? '-'} />
        <StatCard label="출석" value={s?.present ?? '-'} accent="#16A34A" valueColor="#166534" />
        <StatCard label="지각" value={s?.late ?? '-'} accent="#D97706" valueColor="#92400E" />
        <StatCard label="결석" value={s?.absent ?? '-'} accent="#DC2626" valueColor="#B91C1C" />
        <StatCard label="미출" value={s?.none ?? '-'} accent="#64748B" valueColor="#334155" />
        <StatCard label="승인 대기" value={s?.pending ?? '-'} accent="#4F46E5" valueColor="#3730A3" />
        <StatCard label="동일기기 의심" value={s?.suspicious ?? '-'} accent="#DC2626" valueColor="#991B1B" />
      </div>

      {/* ── 표 ── */}
      <div>
        <div className="table-wrap" style={{ borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}>
          <table className="table adm-table-min" style={{ minWidth: 960 }}>
            <thead>
              <tr>
                <th scope="col">학교</th>
                <th scope="col">학번</th>
                <th scope="col">이름</th>
                <th scope="col">위치</th>
                <th scope="col">날짜</th>
                <th scope="col">참가여부</th>
                <th scope="col">동일기기 의심</th>
                <th scope="col">출석 시각</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.studentId}-${r.sessionId}`} className={r.suspicious ? 'danger' : ''}>
                  <td>{r.schoolName}</td>
                  <td>{r.studentNo}</td>
                  <td style={{ fontWeight: 500 }}>
                    {r.name}
                    <div className="adm-small">{r.department}</div>
                  </td>
                  <td style={{ color: r.locationText.startsWith('반경 밖') ? 'var(--absent-text)' : undefined }}>{r.locationText}</td>
                  <td>
                    {r.date}
                    <div className="adm-small">
                      {r.period}교시 {r.courseName}
                    </div>
                  </td>
                  <td>
                    <div className="adm-row" style={{ gap: 4 }}>
                      <StatusBadge status={r.status} />
                      {r.pendingChangeRequest && <span className="adm-chip info">변경 신청 중</span>}
                    </div>
                  </td>
                  <td>{r.suspicious ? <span className="badge suspicious">의심{r.suspiciousReason ? ` · ${r.suspiciousReason}` : ''}</span> : <span style={{ color: 'var(--muted)' }}>없음</span>}</td>
                  <td>
                    {fmtTime(r.checkedAt)}
                    {r.decidedAt && r.decidedAt !== r.checkedAt && <div className="adm-small">판정 {fmtTime(r.decidedAt)}</div>}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="adm-empty">
                    {list.loading ? '불러오는 중…' : '조건에 맞는 출석 기록이 없어요.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {/* 아래 줄: 인원 수 + 다운로드 (지금 고른 조건 그대로 내려받음) */}
        <div
          style={{
            background: '#fff',
            border: '1px solid var(--line)',
            borderTop: 0,
            borderRadius: '0 0 var(--radius) var(--radius)',
            padding: '14px 18px',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <span className="adm-small" style={{ fontSize: 13 }}>
            {rows.length}명 표시
          </span>
          <div className="adm-row">
            <a className="btn outline sm" href={`/api/admin/attendance/export?${query}&format=xlsx`} download>
              Excel 다운로드
            </a>
            <a className="btn secondary sm" href={`/api/admin/attendance/export?${query}&format=csv`} download>
              CSV 다운로드
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
