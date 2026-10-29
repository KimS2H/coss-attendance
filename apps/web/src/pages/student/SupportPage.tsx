// S-06 학생 문의·오류 신고 화면.
// 위: 새 문의 보내기 (분류, 관련 수업, 내용) / 아래: 내가 보낸 문의와 답변
// 주소에 ?category=…&sessionId=… 가 붙어 오면 (출석 실패 창의 "문의하기") 미리 골라 둔다.
import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, errorMessage } from '../../api/client';
import { STUDENT_TICKET_CATEGORIES } from '../../api/types';
import type { NewTicket, Ticket, Today } from '../../api/types';
import { LogoBadge } from '../../components/Brand';
import { fmtDateTime, TICKET_STATUS_CLASS, TICKET_STATUS_LABEL } from '../../components/format';
import { IconBack } from '../../components/Icons';

const APP_VERSION = '1.0.0';

export default function SupportPage() {
  const [params] = useSearchParams();
  const initialCategory = params.get('category');
  const initialSession = params.get('sessionId');

  const [category, setCategory] = useState<string>(
    initialCategory && (STUDENT_TICKET_CATEGORIES as readonly string[]).includes(initialCategory) ? initialCategory : '',
  );
  const [sessionId, setSessionId] = useState<string>(initialSession ?? '');
  const [content, setContent] = useState('');
  const [today, setToday] = useState<Today | null>(null);
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);

  // 내 문의 목록 불러오기
  const loadTickets = useCallback(async () => {
    try {
      setTickets(await api.get<Ticket[]>('/api/student/tickets'));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    void loadTickets();
    // 관련 수업 목록은 오늘 수업에서 고른다 (실패해도 "관련 수업 없음"으로 보낼 수 있음)
    api
      .get<Today>('/api/student/today')
      .then(setToday)
      .catch(() => setToday(null));
  }, [loadTickets]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setDone('');
    if (!category) return setError('어떤 문제인지 골라 주세요.');
    if (!content.trim()) return setError('내용을 입력해 주세요.');
    const body: NewTicket = {
      category,
      sessionId: sessionId ? Number(sessionId) : null,
      content: content.trim(),
      // 기기 정보·앱 버전 (위치 좌표는 보내지 않는다. 마지막 출석 시도 결과는 서버가 붙인다)
      diagnostics: {
        userAgent: navigator.userAgent,
        screen: `${window.screen.width}x${window.screen.height}`,
        appVersion: APP_VERSION,
      },
    };
    setBusy(true);
    try {
      await api.post<Ticket>('/api/student/tickets', body);
      setDone('문의를 보냈어요. 담당자가 확인하면 아래 "내 문의"에 답변이 보여요.');
      setContent('');
      void loadTickets();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="st-page">
      {/* 뒤로 가기 + 제목 + 로고 */}
      <header className="st-back-header">
        <Link to="/" aria-label="출석 화면으로">
          <IconBack size={22} />
        </Link>
        <h1>문의·오류 신고</h1>
        <span style={{ marginLeft: 'auto' }}>
          <LogoBadge size={32} />
        </span>
      </header>

      <form className="st-body" style={{ gap: 16, paddingTop: 16 }} onSubmit={submit} noValidate>
        {/* 분류 고르기 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p id="cat-label" style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-2)' }}>
            어떤 문제인가요?
          </p>
          <div className="st-chips" role="group" aria-labelledby="cat-label">
            {STUDENT_TICKET_CATEGORIES.map((c) => (
              <button key={c} type="button" aria-pressed={category === c} onClick={() => setCategory(c)}>
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* 관련 수업 */}
        <div className="field" style={{ margin: 0 }}>
          <label className="label" htmlFor="t-class" style={{ fontWeight: 700 }}>
            관련 수업
          </label>
          <select id="t-class" className="select" value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
            {today?.sessions.map((s) => (
              <option key={s.id} value={String(s.id)}>
                {s.period}교시 {s.courseName} (오늘 {s.startTime})
              </option>
            ))}
            {/* 주소로 받은 수업이 오늘 목록에 없을 때도 선택이 유지되도록 */}
            {sessionId && today && !today.sessions.some((s) => String(s.id) === sessionId) && (
              <option value={sessionId}>선택한 수업</option>
            )}
            <option value="">관련 수업 없음</option>
          </select>
        </div>

        {/* 내용 */}
        <div className="field" style={{ margin: 0 }}>
          <label className="label" htmlFor="t-body" style={{ fontWeight: 700 }}>
            내용
          </label>
          <textarea
            id="t-body"
            className="textarea"
            rows={4}
            required
            placeholder="예: 강의실 안인데 350m 떨어져 있다고 나와요."
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
        </div>

        <div style={{ background: 'var(--tint)', borderRadius: 12, padding: '12px 14px' }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--navy)' }}>함께 보내는 정보</p>
          <p style={{ margin: '4px 0 0', fontSize: 12, lineHeight: 1.6, color: 'var(--text-2)' }}>
            기기 정보 · 마지막 출석 시도 결과 · 앱 버전 (위치 좌표는 보내지 않아요)
          </p>
        </div>

        {error && (
          <p className="st-error" role="alert" style={{ margin: 0 }}>
            {error}
          </p>
        )}
        {done && (
          <p className="st-success" role="status">
            {done}
          </p>
        )}

        <button type="submit" className="btn block" disabled={busy}>
          {busy ? '보내는 중…' : '문의 보내기'}
        </button>

        {/* 내 문의 목록 */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h2 className="st-section-title">내 문의</h2>
          {tickets === null && <p className="st-note">불러오는 중…</p>}
          {tickets?.length === 0 && <p className="st-note">아직 보낸 문의가 없어요.</p>}
          {tickets?.map((t) => (
            <TicketCard key={t.id} ticket={t} />
          ))}
        </section>
      </form>
    </div>
  );
}

/** 내 문의 한 건 (상태 + 내용 + 답변) */
function TicketCard({ ticket }: { ticket: Ticket }) {
  const replies = (ticket.messages ?? []).filter((m) => m.authorType !== 'student');
  return (
    <div className="st-ticket">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>{ticket.category}</span>
        <span className={`badge ${TICKET_STATUS_CLASS[ticket.status]}`}>{TICKET_STATUS_LABEL[ticket.status]}</span>
      </div>
      <p style={{ fontSize: 12, color: 'var(--muted)' }}>
        {fmtDateTime(ticket.createdAt)}
        {ticket.sessionLabel ? ` · ${ticket.sessionLabel}` : ''}
      </p>
      <p style={{ fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{ticket.content}</p>
      {replies.map((m, i) => (
        <div key={m.id ?? i} className="st-reply">
          <b>{m.authorType === 'admin' ? '총관리자' : '담당자'} 답변</b> · {fmtDateTime(m.createdAt)}
          <div style={{ whiteSpace: 'pre-wrap' }}>{m.body}</div>
        </div>
      ))}
    </div>
  );
}
