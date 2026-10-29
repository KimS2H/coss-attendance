// L-02 출석 현황 (인솔자 첫 화면).
// 날짜·수업·상태·검색으로 거르고, 15초마다 자동으로 새로 고친다.
// 표에서 학생별로 "출결 변경 신청"을 할 수 있고, 엑셀/CSV로 내려받을 수 있다.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../../api/client';
import type { AttendanceList, AttendanceRow, StaffSession } from '../../api/types';
import { fmtDateLabel, fmtTime, nowKstHHMM, STATUS_LABEL, todayKst } from '../../components/format';
import { useInterval } from '../../components/hooks';
import { IconDownload, IconScreen } from '../../components/Icons';
import { ChangeRequestModal } from './ChangeRequestForm';
import { useStaff } from './context';

// 상태 거르기 목록. "의심"은 서버에 보내지 않고 화면에서 거른다.
const STATUS_FILTERS: { value: string; label: string }[] = [
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
  const { canEdit } = useStaff();
  const [date, setDate] = useState(todayKst());
  const [sessions, setSessions] = useState<StaffSession[]>([]);
  const [sessionId, setSessionId] = useState<string>(''); // '' = 전체 수업
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [data, setData] = useState<AttendanceList | null>(null);
  const [error, setError] = useState('');
  const [changeRow, setChangeRow] = useState<AttendanceRow | null>(null);
  const [notice, setNotice] = useState('');

  // 날짜가 바뀌면 그날 수업 목록을 불러오고, 지금 진행 중인 수업(없으면 첫 수업)을 고른다
  useEffect(() => {
    let cancelled = false;
    api
      .get<StaffSession[]>(`/api/staff/sessions?date=${date}`)
      .then((list) => {
        if (cancelled) return;
        setSessions(list);
        const now = nowKstHHMM();
        const ongoing = date === todayKst() ? list.find((s) => s.startTime <= now && now < s.endTime) : undefined;
        const upcoming = date === todayKst() ? list.find((s) => now < s.endTime) : undefined;
        const pick = ongoing ?? upcoming ?? list[0];
        setSessionId(pick ? String(pick.id) : '');
      })
      .catch((e) => {
        if (!cancelled) setError(errorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, [date]);

  // 검색어는 입력을 멈춘 뒤 0.3초 후에 반영 (글자마다 서버를 부르지 않도록)
  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => window.clearTimeout(id);
  }, [q]);

  // 서버에 보낼 조건 (주소 뒤 ?date=…&sessionId=… 부분)
  const query = useMemo(() => {
    const p = new URLSearchParams({ date });
    if (sessionId) p.set('sessionId', sessionId);
    if (status && status !== 'suspicious') p.set('status', status);
    if (debouncedQ) p.set('q', debouncedQ);
    return p.toString();
  }, [date, sessionId, status, debouncedQ]);

  const load = useCallback(async () => {
    try {
      setData(await api.get<AttendanceList>(`/api/staff/attendance?${query}`));
      setError('');
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [query]);

  useEffect(() => {
    void load();
  }, [load]);
  useInterval(() => void load(), 15_000);

  const rows = useMemo(() => {
    const all = data?.rows ?? [];
    return status === 'suspicious' ? all.filter((r) => r.suspicious) : all;
  }, [data, status]);

  const selected = sessions.find((s) => String(s.id) === sessionId);
  const summary = data?.summary;

  return (
    <>
      <div className="sf-title-row">
        <div>
          <h1 className="sf-title">출석 현황</h1>
          <p className="sf-sub">
            {fmtDateLabel(date)}
            {selected && ` · ${selected.period}교시 ${selected.courseName} · ${selected.locationName} · ${selected.startTime}–${selected.endTime}`}
          </p>
        </div>
        {selected ? (
          <Link to={`/staff/code/${selected.id}`} className="btn" style={{ height: 48 }}>
            <IconScreen size={20} />
            강의실 코드 띄우기
          </Link>
        ) : (
          <button type="button" className="btn" disabled title="수업을 먼저 고르세요">
            <IconScreen size={20} />
            강의실 코드 띄우기
          </button>
        )}
      </div>

      {/* 거르기 */}
      <div className="sf-filters">
        <div className="field">
          <label className="label" htmlFor="f-date">
            날짜
          </label>
          <input id="f-date" className="input" type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </div>
        <div className="field" style={{ flex: '1 1 220px' }}>
          <label className="label" htmlFor="f-class">
            수업
          </label>
          <select id="f-class" className="select" value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
            <option value="">전체 수업</option>
            {sessions.map((s) => (
              <option key={s.id} value={String(s.id)}>
                {s.period}교시 {s.courseName} ({s.locationName})
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ flex: '1 1 140px' }}>
          <label className="label" htmlFor="f-status">
            상태
          </label>
          <select id="f-status" className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUS_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ flex: '2 1 220px' }}>
          <label className="label" htmlFor="f-search">
            검색
          </label>
          <input id="f-search" className="input" type="search" placeholder="학번 또는 이름" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {error && <p className="sf-alert">{error}</p>}
      {notice && <p className="sf-ok">{notice}</p>}

      {/* 요약 카드 */}
      {summary && (
        <div className="sf-summary">
          <Stat label="전체" value={summary.total} />
          <Stat label="출석" value={summary.present} color="var(--present)" text="var(--present-text)" />
          <Stat label="지각" value={summary.late} color="var(--late)" text="var(--late-text)" />
          <Stat label="결석" value={summary.absent} color="var(--absent)" text="var(--absent-text)" />
          <Stat label="미출" value={summary.none} color="#64748b" text="var(--text-2)" />
          <Stat label="승인 대기" value={summary.pending} color="#4f46e5" text="#3730a3" />
          <Stat label="동일기기 의심" value={summary.suspicious} color="var(--absent)" text="#991b1b" />
        </div>
      )}

      {/* 출석 표 */}
      <div className="table-wrap">
        <table className="table" style={{ minWidth: 900 }}>
          <thead>
            <tr>
              <th scope="col">학번</th>
              <th scope="col">이름</th>
              <th scope="col">위치</th>
              <th scope="col">날짜</th>
              <th scope="col">참가여부</th>
              <th scope="col">동일기기 의심여부</th>
              <th scope="col">출석 시각</th>
              <th scope="col">
                출결 변경
              </th>
            </tr>
          </thead>
          <tbody>
            {data === null && (
              <tr>
                <td colSpan={8} className="sf-empty">
                  불러오는 중…
                </td>
              </tr>
            )}
            {data !== null && rows.length === 0 && (
              <tr>
                <td colSpan={8} className="sf-empty">
                  조건에 맞는 학생이 없어요.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={`${r.studentId}-${r.sessionId}`} className={r.suspicious ? 'sf-suspicious' : ''}>
                <td>{r.studentNo}</td>
                <td style={{ fontWeight: 500 }}>{r.name}</td>
                <td style={{ color: r.locationText.startsWith('반경 밖') ? 'var(--absent-text)' : undefined }}>{r.locationText}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {r.date}
                  {!sessionId && <span style={{ color: 'var(--muted)' }}> · {r.period}교시</span>}
                </td>
                <td>
                  <span className={`badge ${r.status}`}>{STATUS_LABEL[r.status]}</span>
                </td>
                <td>
                  {r.suspicious ? (
                    <span className="badge" style={{ background: 'var(--absent-bg)', color: '#991b1b' }}>
                      의심{r.suspiciousReason ? ` · ${r.suspiciousReason}` : ''}
                    </span>
                  ) : (
                    <span style={{ color: 'var(--muted)' }}>없음</span>
                  )}
                </td>
                <td>{fmtTime(r.checkedAt ?? r.decidedAt) || '-'}</td>
                <td style={{ textAlign: 'right' }}>
                  <RowAction row={r} canEdit={canEdit} onChange={() => setChangeRow(r)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="sf-table-foot">
          <span>
            {rows.length}명 · 출결 변경은 총관리자 승인 후 반영돼요 · 15초마다 자동 새로 고침
          </span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {/* 다운로드는 주소로 바로 받는다 (로그인 쿠키가 같이 감) */}
            <a className="sf-small-btn primary" href={`/api/staff/attendance/export?${query}&format=xlsx`}>
              <IconDownload size={16} />
              Excel 다운로드
            </a>
            <a className="sf-small-btn" href={`/api/staff/attendance/export?${query}&format=csv`}>
              <IconDownload size={16} />
              CSV 다운로드
            </a>
          </div>
        </div>
      </div>

      {changeRow && (
        <ChangeRequestModal
          title={`출결 변경 신청 · ${changeRow.name}(${changeRow.studentNo}) · ${changeRow.period}교시 ${changeRow.courseName}`}
          studentId={changeRow.studentId}
          sessionId={changeRow.sessionId}
          fromStatus={changeRow.status}
          onCancel={() => setChangeRow(null)}
          onDone={() => {
            setChangeRow(null);
            setNotice('출결 변경을 신청했어요. 총관리자가 승인하면 반영돼요. (문의함 → 출결 변경 신청 내역에서 확인)');
            void load();
          }}
        />
      )}
    </>
  );
}

/** 요약 카드 하나 */
function Stat({ label, value, color, text }: { label: string; value: number; color?: string; text?: string }) {
  return (
    <div className="sf-stat" style={color ? { borderTop: `4px solid ${color}` } : undefined}>
      <span>{label}</span>
      <b style={text ? { color: text } : undefined}>{value}</b>
    </div>
  );
}

/** 표 맨 오른쪽 버튼: 승인 대기면 "승인하기", 아니면 "출결 변경 신청" */
function RowAction({ row, canEdit, onChange }: { row: AttendanceRow; canEdit: boolean; onChange: () => void }) {
  if (!canEdit) return null;
  if (row.status === 'pending_device') {
    return (
      <Link to="/staff/devices" className="sf-small-btn primary">
        승인하기
      </Link>
    );
  }
  if (row.pendingChangeRequest) {
    return <span className="badge late">변경 신청 중</span>;
  }
  return (
    <button type="button" className="sf-small-btn" onClick={onChange}>
      출결 변경 신청
    </button>
  );
}
