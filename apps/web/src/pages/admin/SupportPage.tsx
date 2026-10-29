// ─────────────────────────────────────────────
// A-10 문의·오류. 왼쪽은 문의 목록, 오른쪽은 고른 문의의 내용·대화·답변.
//  범위: 관리자 처리(scope=admin, 이관된 학생 문의 + 인솔자 문의) / 전체 기록(scope=all)
//  GET  /api/admin/tickets?scope=admin|all&status=
//  POST /api/admin/tickets/:id/messages { body }   답변 보내기
//  POST /api/admin/tickets/:id/resolve             해결 처리
// 주소 뒤 ?id=12 로 특정 문의를 바로 열 수 있다 (대시보드·출결 변경에서 연결).
// ─────────────────────────────────────────────
import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import type { Ticket, TicketStatus } from '../../api/types';
import { adminError, fmtDateTime, TICKET_STATUS_LABEL } from '../../components/admin/format';
import { useInterval, useLoad } from '../../components/admin/hooks';
import { Alert, LoadError, PageHead, Tabs } from '../../components/admin/ui';

type Scope = 'admin' | 'all';

const STATUS_TONE: Record<TicketStatus, string> = { open: 'warn', in_progress: 'info', escalated: 'danger', resolved: 'ok' };

/** 문의 구분 표시: 인솔자 문의 / 인솔자 이관(학생 문의) / 학생 문의 */
function kindLabel(t: Ticket): { text: string; tone: string } {
  if (t.reporterType === 'staff') return { text: '인솔자 문의', tone: 'info' };
  if (t.assignee === 'admin') return { text: '인솔자 이관', tone: 'danger' };
  return { text: '학생 문의', tone: '' };
}

export default function SupportPage() {
  const [params, setParams] = useSearchParams();
  const selectedId = Number(params.get('id')) || null;
  // ?id= 로 들어오면 그 문의를 찾을 수 있게 "전체 기록"으로 시작
  const [scope, setScope] = useState<Scope>(params.get('scope') === 'all' || selectedId ? 'all' : 'admin');
  const [status, setStatus] = useState<'' | TicketStatus>('');

  const query = `scope=${scope}${status ? `&status=${status}` : ''}`;
  const { data, error, loading, reload, setData } = useLoad(() => api.get<Ticket[]>(`/api/admin/tickets?${query}`), [query]);
  useInterval(() => void reload(), 30_000);

  const tickets = data ?? [];
  const selected = tickets.find((t) => t.id === selectedId) ?? null;

  function select(id: number) {
    const next = new URLSearchParams(params);
    next.set('id', String(id));
    setParams(next, { replace: true });
  }

  /** 답변·해결 후 서버가 돌려준 문의로 목록의 그 항목을 바꾼다 */
  function replaceTicket(t: Ticket) {
    setData((prev) => (prev ? prev.map((x) => (x.id === t.id ? t : x)) : prev));
  }

  return (
    <>
      <PageHead title="문의·오류" desc="학생 문의는 인솔자가 먼저 처리하고, 어려우면 총관리자에게 이관돼요. 인솔자 문의는 바로 총관리자에게 와요." />

      <div className="adm-row" style={{ justifyContent: 'space-between' }}>
        <Tabs
          value={scope}
          onChange={setScope}
          items={[
            { value: 'admin', label: '관리자 처리' },
            { value: 'all', label: '전체 기록' },
          ]}
        />
        <div className="adm-row">
          <label className="label" htmlFor="t-status" style={{ margin: 0 }}>
            상태
          </label>
          <select id="t-status" className="select" style={{ width: 160 }} value={status} onChange={(e) => setStatus(e.target.value as '' | TicketStatus)}>
            <option value="">전체</option>
            {(Object.keys(TICKET_STATUS_LABEL) as TicketStatus[]).map((s) => (
              <option key={s} value={s}>
                {TICKET_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <LoadError message={error} onRetry={reload} />}

      <div className="adm-split">
        {/* ── 왼쪽: 목록 ── */}
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">접수</th>
                <th scope="col">학교 · 보낸 사람</th>
                <th scope="col">분류</th>
                <th scope="col">상태</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => {
                const k = kindLabel(t);
                return (
                  <tr key={t.id} className={`clickable ${t.id === selectedId ? 'selected' : ''}`} onClick={() => select(t.id)}>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 13 }}>{fmtDateTime(t.createdAt)}</td>
                    <td>
                      {t.schoolName} · {t.reporterName}
                      <div>
                        <span className={`adm-chip ${k.tone}`}>{k.text}</span>
                      </div>
                    </td>
                    <td>{t.category}</td>
                    <td>
                      <span className={`adm-chip ${STATUS_TONE[t.status]}`}>{TICKET_STATUS_LABEL[t.status]}</span>
                    </td>
                  </tr>
                );
              })}
              {tickets.length === 0 && (
                <tr>
                  <td colSpan={4} className="adm-empty">
                    {loading ? '불러오는 중…' : '문의가 없어요.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* ── 오른쪽: 상세 ── */}
        {selected ? (
          <TicketDetail key={selected.id} t={selected} onChanged={replaceTicket} />
        ) : (
          <section className="adm-section">
            <p className="adm-empty">{selectedId && !loading ? '이 범위에서 해당 문의를 찾지 못했어요. "전체 기록"을 눌러 보세요.' : '왼쪽 목록에서 문의를 고르세요.'}</p>
          </section>
        )}
      </div>
    </>
  );
}

/** 문의 한 건의 상세: 정보, 진단 정보, 대화, 답변 입력, 해결 버튼 */
function TicketDetail({ t, onChanged }: { t: Ticket; onChanged: (t: Ticket) => void }) {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resolved = t.status === 'resolved';

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await api.post<Ticket>(`/api/admin/tickets/${t.id}/messages`, { body: body.trim() });
      setBody('');
      onChanged(updated);
    } catch (err) {
      setError(adminError(err));
    } finally {
      setBusy(false);
    }
  }

  async function resolve() {
    if (!window.confirm('이 문의를 해결 처리할까요?')) return;
    setBusy(true);
    setError(null);
    try {
      onChanged(await api.post<Ticket>(`/api/admin/tickets/${t.id}/resolve`, {}));
    } catch (err) {
      setError(adminError(err));
    } finally {
      setBusy(false);
    }
  }

  const k = kindLabel(t);
  return (
    <section className="adm-section" aria-label="문의 상세">
      <div className="adm-section-head">
        <h2>{t.category}</h2>
        <div className="adm-row" style={{ gap: 6 }}>
          <span className={`adm-chip ${k.tone}`}>{k.text}</span>
          <span className={`adm-chip ${STATUS_TONE[t.status]}`}>{TICKET_STATUS_LABEL[t.status]}</span>
        </div>
      </div>
      <dl className="adm-kv">
        <dt>학교</dt>
        <dd>{t.schoolName}</dd>
        <dt>보낸 사람</dt>
        <dd>
          {t.reporterName} ({t.reporterType === 'student' ? '학생' : '인솔자'})
        </dd>
        <dt>접수 시각</dt>
        <dd>{fmtDateTime(t.createdAt)}</dd>
        <dt>수업</dt>
        <dd>{t.sessionLabel ?? '-'}</dd>
        <dt>담당</dt>
        <dd>{t.assignee === 'admin' ? '총관리자' : '인솔자'}</dd>
      </dl>
      <div className="adm-msg">
        <span className="who">문의 내용</span>
        <span className="body">{t.content}</span>
      </div>

      {/* 진단 정보: 서버가 붙인 마지막 출석 시도 결과, 브라우저 정보 등 */}
      {t.diagnostics && Object.keys(t.diagnostics).length > 0 && (
        <details>
          <summary style={{ cursor: 'pointer', fontSize: 14, fontWeight: 500 }}>진단 정보 보기</summary>
          <dl className="adm-kv" style={{ marginTop: 8, fontSize: 13 }}>
            {Object.entries(t.diagnostics).map(([key, v]) => (
              <div key={key} style={{ display: 'contents' }}>
                <dt>{key}</dt>
                <dd>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}

      {/* 대화 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {t.messages.map((m) => (
          <div key={m.id} className={`adm-msg ${m.authorType === 'admin' ? 'admin' : ''}`}>
            <span className="who">
              {m.authorName} ({m.authorType === 'admin' ? '총관리자' : m.authorType === 'staff' ? '인솔자' : '학생'}) · <span className="adm-small">{fmtDateTime(m.createdAt)}</span>
            </span>
            <span className="body">{m.body}</span>
          </div>
        ))}
        {t.messages.length === 0 && <p className="adm-small">아직 답변이 없어요.</p>}
      </div>

      {/* 답변 입력 */}
      {!resolved && (
        <form onSubmit={send} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label className="label" htmlFor="reply" style={{ margin: 0 }}>
            답변
          </label>
          <textarea id="reply" className="textarea" value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} />
          {error && <Alert kind="error">{error}</Alert>}
          <div className="adm-row end">
            <button type="button" className="btn secondary" onClick={resolve} disabled={busy}>
              해결
            </button>
            <button type="submit" className="btn" disabled={busy || !body.trim()}>
              {busy ? '보내는 중…' : '답변 보내기'}
            </button>
          </div>
        </form>
      )}
      {resolved && <Alert kind="ok">해결된 문의예요.</Alert>}
    </section>
  );
}
