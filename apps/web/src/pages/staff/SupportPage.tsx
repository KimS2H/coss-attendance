// L-05 문의함.
// 탭: 처리할 문의(접수·처리 중) / 이관됨(총관리자에게 넘김) / 해결됨 / 출결 변경 신청 내역
// 왼쪽 목록에서 문의를 고르면 오른쪽에 내용·대화·답변 칸·처리 버튼이 나온다.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, errorMessage } from '../../api/client';
import type { ChangeRequest, StudentRow, Ticket } from '../../api/types';
import {
  CHANGE_STATUS_CLASS,
  CHANGE_STATUS_LABEL,
  fmtDateTime,
  STATUS_LABEL,
  TICKET_STATUS_CLASS,
  TICKET_STATUS_LABEL,
} from '../../components/format';
import { useInterval } from '../../components/hooks';
import { ChangeRequestForm } from './ChangeRequestForm';
import { useStaff } from './context';

type Tab = 'todo' | 'escalated' | 'resolved' | 'changes';

export default function SupportPage() {
  const { canEdit, refreshCounts } = useStaff();
  const [tab, setTab] = useState<Tab>('todo');
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [error, setError] = useState('');

  // 문의는 한 번에 모두 불러와 탭별로 나눈다 (처리할 문의 = 접수 + 처리 중)
  const load = useCallback(async () => {
    try {
      setTickets(await api.get<Ticket[]>('/api/staff/tickets'));
      setError('');
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);
  useInterval(() => void load(), 30_000);

  const groups = useMemo(() => {
    const all = tickets ?? [];
    return {
      todo: all.filter((t) => t.status === 'open' || t.status === 'in_progress'),
      escalated: all.filter((t) => t.status === 'escalated'),
      resolved: all.filter((t) => t.status === 'resolved'),
    };
  }, [tickets]);

  const visible = tab === 'changes' ? [] : groups[tab];
  const selected = visible.find((t) => t.id === selectedId) ?? null;

  // 처리 후 서버가 돌려준 문의로 목록을 바꾼다
  function replaceTicket(t: Ticket) {
    setTickets((list) => (list ? list.map((x) => (x.id === t.id ? t : x)) : list));
    refreshCounts();
  }

  return (
    <>
      <div>
        <h1 className="sf-title">문의함</h1>
        <p className="sf-sub">학생 문의는 인솔자가 처리하고, 해결이 어려우면 총관리자에게 넘겨요. 모든 문의 기록은 총관리자도 볼 수 있어요.</p>
      </div>

      <div className="sf-tabs" role="tablist" aria-label="문의 구분">
        <button type="button" role="tab" aria-selected={tab === 'todo'} onClick={() => setTab('todo')}>
          처리할 문의 {groups.todo.length > 0 && <span className="sf-count">{groups.todo.length}</span>}
        </button>
        <button type="button" role="tab" aria-selected={tab === 'escalated'} onClick={() => setTab('escalated')}>
          이관됨
        </button>
        <button type="button" role="tab" aria-selected={tab === 'resolved'} onClick={() => setTab('resolved')}>
          해결됨
        </button>
        <button type="button" role="tab" aria-selected={tab === 'changes'} onClick={() => setTab('changes')}>
          출결 변경 신청 내역
        </button>
      </div>

      {error && <p className="sf-alert">{error}</p>}

      {tab === 'changes' ? (
        <ChangeRequestList />
      ) : (
        <div className="sf-split">
          {/* 왼쪽: 문의 목록 */}
          <div className="sf-list">
            {tickets === null && <p className="sf-empty">불러오는 중…</p>}
            {tickets !== null && visible.length === 0 && <p className="sf-empty">문의가 없어요.</p>}
            {visible.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`sf-list-item${t.id === selectedId ? ' selected' : ''}`}
                onClick={() => setSelectedId(t.id)}
              >
                <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8, width: '100%' }}>
                  <strong style={{ fontSize: 15 }}>{t.reporterName}</strong>
                  <span className={`badge ${TICKET_STATUS_CLASS[t.status]}`}>{t.status === 'open' ? '새 문의' : TICKET_STATUS_LABEL[t.status]}</span>
                </span>
                <span style={{ fontSize: 13, color: 'var(--navy)', fontWeight: 700 }}>{t.category}</span>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                  {t.sessionLabel ? `${t.sessionLabel} · ` : ''}
                  {fmtDateTime(t.createdAt)}
                </span>
              </button>
            ))}
          </div>

          {/* 오른쪽: 문의 상세 */}
          {selected ? (
            <TicketDetail key={selected.id} ticket={selected} canEdit={canEdit} onUpdated={replaceTicket} />
          ) : (
            <section className="sf-detail">
              <p className="sf-empty">왼쪽에서 문의를 고르세요.</p>
            </section>
          )}
        </div>
      )}
    </>
  );
}

/** 문의 상세: 내용, 기기 정보, 대화, 답변·이관·해결, 출결 변경 신청 */
function TicketDetail({ ticket, canEdit, onUpdated }: { ticket: Ticket; canEdit: boolean; onUpdated: (t: Ticket) => void }) {
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const closed = ticket.status === 'resolved';
  const escalated = ticket.status === 'escalated';

  // 답변 보내기 → (선택) 해결
  async function sendReply(resolveAfter: boolean) {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      let t = ticket;
      if (reply.trim()) t = await api.post<Ticket>(`/api/staff/tickets/${ticket.id}/messages`, { body: reply.trim() });
      if (resolveAfter) t = await api.post<Ticket>(`/api/staff/tickets/${ticket.id}/resolve`, {});
      setReply('');
      onUpdated(t);
      setNotice(resolveAfter ? '해결로 처리했어요.' : '답변을 보냈어요.');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function escalate() {
    if (!window.confirm('이 문의를 총관리자에게 넘길까요?')) return;
    setError('');
    setBusy(true);
    try {
      // 답변 칸에 쓴 내용이 있으면 먼저 남기고 넘긴다
      if (reply.trim()) await api.post<Ticket>(`/api/staff/tickets/${ticket.id}/messages`, { body: reply.trim() });
      const t = await api.post<Ticket>(`/api/staff/tickets/${ticket.id}/escalate`, {});
      setReply('');
      onUpdated(t);
      setNotice('총관리자에게 넘겼어요.');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const diag = ticket.diagnostics ? Object.entries(ticket.diagnostics) : [];

  return (
    <section className="sf-detail" aria-label="문의 상세">
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)' }}>{ticket.category}</span>
          <h2 style={{ margin: '2px 0 0', fontSize: 19, fontWeight: 700 }}>
            {ticket.reporterName}
            {ticket.sessionLabel ? ` · ${ticket.sessionLabel}` : ''}
          </h2>
        </div>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>
          접수 {fmtDateTime(ticket.createdAt)} · <span className={`badge ${TICKET_STATUS_CLASS[ticket.status]}`}>{TICKET_STATUS_LABEL[ticket.status]}</span>
        </span>
      </div>

      <p className="sf-msg" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
        {ticket.content}
      </p>

      {/* 학생 기기·마지막 시도 정보 (서버가 붙여 줌) */}
      {diag.length > 0 && (
        <dl className="sf-dl">
          {diag.map(([k, v]) => (
            <DiagRow key={k} k={k} v={v} />
          ))}
        </dl>
      )}

      {/* 대화 기록 */}
      {ticket.messages.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {ticket.messages.map((m, i) => (
            <div key={m.id ?? i} className={`sf-msg${m.authorType !== 'student' ? ' mine' : ''}`}>
              <small>
                {m.authorName} ({m.authorType === 'student' ? '학생' : m.authorType === 'staff' ? '인솔자' : '총관리자'}) · {fmtDateTime(m.createdAt)}
              </small>
              <span style={{ whiteSpace: 'pre-wrap' }}>{m.body}</span>
            </div>
          ))}
        </div>
      )}

      {error && <p className="sf-alert">{error}</p>}
      {notice && <p className="sf-ok">{notice}</p>}

      {canEdit && !closed && (
        <>
          <div className="field" style={{ margin: 0 }}>
            <label className="label" htmlFor="reply" style={{ fontWeight: 700 }}>
              답변
            </label>
            <textarea id="reply" className="textarea" rows={3} placeholder="학생에게 보낼 답변" value={reply} onChange={(e) => setReply(e.target.value)} />
          </div>

          {/* 수업이 연결된 학생 문의면 바로 출결 변경 신청 */}
          {ticket.sessionId !== null && ticket.reporterType === 'student' && <TicketChangeRequest ticket={ticket} />}

          <div className="sf-actions">
            {!escalated && (
              <button type="button" className="btn secondary" disabled={busy} onClick={() => void escalate()}>
                총관리자에게 넘기기
              </button>
            )}
            <button type="button" className="btn secondary" disabled={busy || !reply.trim()} onClick={() => void sendReply(false)}>
              답변 보내기
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => void sendReply(true)}>
              {reply.trim() ? '답변 보내고 해결' : '해결'}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

/** 진단 정보 한 줄 (값이 객체면 짧은 글로 바꿔 보여 준다) */
function DiagRow({ k, v }: { k: string; v: unknown }) {
  const LABELS: Record<string, string> = {
    userAgent: '기기',
    screen: '화면',
    appVersion: '앱 버전',
    lastAttempt: '마지막 시도',
  };
  const text = v === null || v === undefined ? '-' : typeof v === 'object' ? JSON.stringify(v) : String(v);
  return (
    <>
      <dt>{LABELS[k] ?? k}</dt>
      <dd>{text}</dd>
    </>
  );
}

/**
 * 문의에서 출결 변경 신청.
 * 문의(Ticket)에는 학생 번호(studentId)가 없어서, reporterName "홍길동(20231234)"에서 학번을 꺼내
 * GET /api/staff/students?q=학번 으로 학생을 찾는다.
 */
function TicketChangeRequest({ ticket }: { ticket: Ticket }) {
  const [student, setStudent] = useState<StudentRow | null>(null);
  const [lookupError, setLookupError] = useState('');
  const [done, setDone] = useState('');

  useEffect(() => {
    const studentNo = /\(([^)]+)\)\s*$/.exec(ticket.reporterName)?.[1];
    if (!studentNo) {
      setLookupError('학번을 알 수 없어 출결 변경 신청을 할 수 없어요. 출석 현황에서 신청해 주세요.');
      return;
    }
    api
      .get<StudentRow[]>(`/api/staff/students?q=${encodeURIComponent(studentNo)}`)
      .then((rows) => {
        const found = rows.find((r) => r.studentNo === studentNo);
        if (found) setStudent(found);
        else setLookupError('학생을 찾지 못했어요. 출석 현황에서 신청해 주세요.');
      })
      .catch((e) => setLookupError(errorMessage(e)));
  }, [ticket.reporterName]);

  return (
    <div style={{ background: 'var(--tint)', borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--navy-dark)' }}>
        출결 변경 신청 <span style={{ fontWeight: 500, color: 'var(--muted)' }}>· 총관리자가 승인하면 반영돼요</span>
      </p>
      {lookupError && <p className="sf-alert">{lookupError}</p>}
      {done && <p className="sf-ok">{done}</p>}
      {student && ticket.sessionId !== null && !done && (
        <ChangeRequestForm
          studentId={student.id}
          sessionId={ticket.sessionId}
          ticketId={ticket.id}
          submitLabel="출결 변경 신청하기"
          onDone={(cr) => setDone(`${STATUS_LABEL[cr.toStatus]}(으)로 변경을 신청했어요. "출결 변경 신청 내역" 탭에서 결과를 확인하세요.`)}
        />
      )}
    </div>
  );
}

/** 내 출결 변경 신청 내역 (대기 중이면 남은 시간 표시) */
function ChangeRequestList() {
  const [list, setList] = useState<ChangeRequest[] | null>(null);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    try {
      setList(await api.get<ChangeRequest[]>('/api/staff/change-requests'));
      setError('');
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);
  useInterval(() => setNow(Date.now()), 1000); // 남은 시간 표시용
  useInterval(() => void load(), 15_000);

  return (
    <>
      {error && <p className="sf-alert">{error}</p>}
      <div className="table-wrap">
        <table className="table" style={{ minWidth: 860 }}>
          <thead>
            <tr>
              <th scope="col">신청 시각</th>
              <th scope="col">학생</th>
              <th scope="col">수업</th>
              <th scope="col">변경</th>
              <th scope="col">사유</th>
              <th scope="col">상태</th>
            </tr>
          </thead>
          <tbody>
            {list === null && (
              <tr>
                <td colSpan={6} className="sf-empty">
                  불러오는 중…
                </td>
              </tr>
            )}
            {list?.length === 0 && (
              <tr>
                <td colSpan={6} className="sf-empty">
                  신청한 내역이 없어요.
                </td>
              </tr>
            )}
            {list?.map((cr) => (
              <tr key={cr.id}>
                <td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(cr.createdAt)}</td>
                <td>
                  {cr.studentName} ({cr.studentNo})
                </td>
                <td>{cr.sessionLabel}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {STATUS_LABEL[cr.fromStatus]} → <b>{STATUS_LABEL[cr.toStatus]}</b>
                </td>
                <td>{cr.reason}</td>
                <td>
                  <span className={`badge ${CHANGE_STATUS_CLASS[cr.status]}`}>
                    {CHANGE_STATUS_LABEL[cr.status]}
                    {cr.status === 'pending' && ` (남은 시간 ${remaining(cr.deadlineAt, now)})`}
                  </span>
                  {cr.status === 'rejected' && cr.rejectReason && (
                    <div style={{ fontSize: 12, color: 'var(--absent-text)', marginTop: 4 }}>사유: {cr.rejectReason}</div>
                  )}
                  {cr.decidedByName && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>처리: {cr.decidedByName}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/** 마감까지 남은 시간 "mm:ss" */
function remaining(deadlineIso: string, now: number) {
  const ms = Math.max(0, new Date(deadlineIso).getTime() - now);
  const total = Math.floor(ms / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
