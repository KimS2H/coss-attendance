// S-03 학생 첫 화면 (오늘 출석).
// - GET /api/student/today 를 30초마다 다시 불러온다
// - 지금 수업을 큰 카드로 보여 주고, 둥근 버튼을 누르면 출석 코드 창이 열린다
// - 출석 결과에 따라 알림(토스트), 실패 창, 승인 대기·출석 취소 안내를 보여 준다
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../../api/client';
import type { AttendResponse, Today, TodaySession } from '../../api/types';
import { fmtDateLabel, fmtTime, nowKstHHMM, STATUS_LABEL } from '../../components/format';
import { useInterval } from '../../components/hooks';
import { IconCheck, IconClock, IconPhone, IconPin, IconWarning, IconX } from '../../components/Icons';
import { CodeSheet, FailSheet } from './AttendSheet';
import { useStudent } from './context';
import { StudentHeader } from './StudentHeader';

// 열려 있는 아래쪽 창
type Sheet =
  | null
  | { kind: 'code'; session: TodaySession }
  | { kind: 'fail'; session: TodaySession; res: AttendResponse; accuracy: number | null };

const FAIL_RESULTS = ['too_early', 'closed', 'out_of_range', 'gps_denied', 'code_wrong', 'not_enrolled'];

export default function MainPage() {
  const { me } = useStudent();
  const [today, setToday] = useState<Today | null>(null);
  const [loadError, setLoadError] = useState('');
  const [sheet, setSheet] = useState<Sheet>(null);
  const [toast, setToast] = useState('');

  // 오늘 수업 불러오기
  const refresh = useCallback(async () => {
    try {
      const t = await api.get<Today>('/api/student/today');
      setToday(t);
      setLoadError('');
    } catch (e) {
      setLoadError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);
  useInterval(() => void refresh(), 30_000);

  // 알림(토스트)은 4초 뒤 사라진다
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(''), 4000);
    return () => window.clearTimeout(id);
  }, [toast]);

  // 출석 요청 결과 처리
  function handleResult(session: TodaySession, res: AttendResponse, accuracy: number | null) {
    if (FAIL_RESULTS.includes(res.result)) {
      setSheet({ kind: 'fail', session, res, accuracy });
      return;
    }
    setSheet(null);
    // 서버가 알려 준 새 상태를 바로 화면에 반영 (새로 불러오기 전에도 보이게)
    setToday((t) =>
      t
        ? {
            ...t,
            sessions: t.sessions.map((s) =>
              s.id === session.id ? { ...s, status: res.status, checkedAt: res.decidedAt ?? s.checkedAt } : s,
            ),
          }
        : t,
    );
    if (res.result === 'present') setToast(`출석이 확인되었어요 (${fmtTime(res.decidedAt ?? new Date().toISOString())})`);
    if (res.result === 'late') setToast(`지각으로 처리되었어요 (${fmtTime(res.decidedAt ?? new Date().toISOString())})`);
    if (res.result === 'pending_device' || res.result === 'proxy_canceled') window.scrollTo({ top: 0, behavior: 'smooth' });
    void refresh();
  }

  const current = today ? pickSession(today) : null;

  return (
    <div className="st-page">
      <StudentHeader student={me.student} />

      {/* 출석 완료 알림 */}
      {toast && (
        <div className="st-toast" role="status">
          <IconCheck size={20} strokeWidth={2.5} />
          <span>{toast}</span>
        </div>
      )}

      <main className="st-body">
        {loadError && (
          <p className="st-error" role="alert" style={{ margin: 0 }}>
            {loadError}{' '}
            <button type="button" onClick={() => void refresh()} style={{ border: 0, background: 'none', color: 'inherit', textDecoration: 'underline', cursor: 'pointer' }}>
              다시 불러오기
            </button>
          </p>
        )}

        {!today && !loadError && <p className="st-center-msg">불러오는 중…</p>}

        {today && (
          <>
            {/* 날짜 */}
            <div className="st-dateline">
              <b>{fmtDateLabel(today.date)}</b>
              <span>서버 날짜 기준</span>
            </div>

            {/* 지금 수업 큰 카드 */}
            {current ? (
              <CurrentCard session={current} onAttend={() => setSheet({ kind: 'code', session: current })} />
            ) : (
              <div className="st-main-card">
                <p className="st-main-title">{today.sessions.length > 0 ? '오늘 수업이 모두 끝났어요' : '오늘 수업이 없어요'}</p>
                <p className="st-note">수업 일정이 다르면 문의해 주세요.</p>
              </div>
            )}

            {/* 승인 대기 / 출석 취소일 때 아래 안내 상자 */}
            {current?.status === 'pending_device' && <PendingNotice session={current} />}
            {current?.status === 'canceled' && <CanceledNotice session={current} />}

            {/* 오늘 수업 목록 */}
            {today.sessions.length > 0 && (
              <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <h2 className="st-section-title">오늘 수업</h2>
                {today.sessions.map((s) => (
                  <SessionRow key={s.id} session={s} isCurrent={s.id === current?.id} now={nowKstHHMM()} />
                ))}
              </section>
            )}
          </>
        )}
      </main>

      {/* 아래쪽 창들 */}
      {sheet?.kind === 'code' && (
        <CodeSheet
          session={sheet.session}
          onClose={() => setSheet(null)}
          onResult={(res, acc) => handleResult(sheet.session, res, acc)}
        />
      )}
      {sheet?.kind === 'fail' && (
        <FailSheet
          session={sheet.session}
          res={sheet.res}
          accuracy={sheet.accuracy}
          onRetry={() => setSheet({ kind: 'code', session: sheet.session })}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  );
}

/** 큰 카드에 보여 줄 수업 고르기: 서버가 정해 준 지금 수업 → 아직 안 끝난 첫 수업 */
function pickSession(t: Today): TodaySession | null {
  if (t.currentSessionId !== null) {
    const s = t.sessions.find((x) => x.id === t.currentSessionId);
    if (s) return s;
  }
  const now = nowKstHHMM(t.serverTime);
  return t.sessions.find((s) => s.endTime > now) ?? null;
}

/** 지금 수업 카드 (가운데 200px 둥근 버튼) */
function CurrentCard({ session, onAttend }: { session: TodaySession; onAttend: () => void }) {
  return (
    <div className="st-main-card">
      <p className="st-main-title">
        {session.period}교시 | {session.courseName}
      </p>
      <p className="st-main-sub">
        <IconPin size={14} />
        {session.locationName} · {session.startTime}–{session.endTime}
      </p>
      <StatusCircle session={session} onAttend={onAttend} />
      {session.status === 'none' ? (
        <p className="st-chip">
          <IconClock size={15} />
          {session.attendFrom} ~ {session.lateFrom} 출석 · 이후 지각
        </p>
      ) : session.status === 'present' || session.status === 'late' ? (
        <p className="st-note">출석은 수업마다 한 번만 할 수 있어요.</p>
      ) : null}
    </div>
  );
}

/** 상태에 따라 모양이 바뀌는 둥근 버튼 */
function StatusCircle({ session, onAttend }: { session: TodaySession; onAttend: () => void }) {
  const time = fmtTime(session.checkedAt);
  switch (session.status) {
    case 'none':
      return (
        <button type="button" className="st-circle none" onClick={onAttend} aria-label="출석하기">
          <span className="big">미출</span>
          <span className="small">눌러서 출석</span>
        </button>
      );
    case 'present':
      return (
        <button type="button" className="st-circle present" disabled>
          <IconCheck size={40} strokeWidth={2.5} />
          <span className="big">출석</span>
          {time && <span className="small">{time} 확인</span>}
        </button>
      );
    case 'late':
      return (
        <button type="button" className="st-circle late" disabled>
          <IconClock size={36} />
          <span className="big">지각</span>
          {time && <span className="small">{time} 확인</span>}
        </button>
      );
    case 'pending_device':
      return (
        <button type="button" className="st-circle pending_device" disabled>
          <IconClock size={36} />
          <span className="big">승인 대기</span>
          <span className="small">담당자 확인 중</span>
        </button>
      );
    case 'canceled':
      return (
        <button type="button" className="st-circle canceled" disabled>
          <IconX size={36} strokeWidth={2.5} />
          <span className="big">출석 취소</span>
        </button>
      );
    case 'excused':
      return (
        <button type="button" className="st-circle excused" disabled>
          <span className="big">공결</span>
        </button>
      );
    case 'absent':
    default:
      return (
        <button type="button" className="st-circle absent" disabled>
          <span className="big">결석</span>
        </button>
      );
  }
}

/** 미등록 기기로 출석 → 승인 대기 안내 (AttendPending 목업) */
function PendingNotice({ session }: { session: TodaySession }) {
  const requested = fmtTime(session.checkedAt);
  return (
    <>
      <div className="st-warn-card">
        <p className="st-warn-title">
          <IconPhone size={18} />
          등록되지 않은 기기예요
        </p>
        <p className="st-alert-line" role="alert">
          <span className="st-bang" aria-hidden="true">
            !
          </span>
          해당 기기의 아이디가 아니에요
        </p>
        <p className="st-note" style={{ color: 'var(--text-2)' }}>
          담당자가 승인하면 <strong>승인한 시각</strong>을 기준으로 출석 또는 지각이 정해져요.
          {requested && ` 요청 ${requested} · 담당자에게 알림을 보냈어요.`}
        </p>
      </div>
      <PenaltyBox />
      <p className="st-note" style={{ fontSize: 12, margin: '0 4px' }}>
        폰을 바꿨다면 담당자에게 말해 주세요. 승인되면 이 기기가 출석 기기로 바뀌어요.
      </p>
      <Link to={`/support?category=${encodeURIComponent('기기 변경·분실')}&sessionId=${session.id}`} className="st-link-center">
        문제가 있으면 문의하기
      </Link>
    </>
  );
}

/** 같은 기기로 다른 계정이 출석 → 출석 취소 안내 */
function CanceledNotice({ session }: { session: TodaySession }) {
  return (
    <>
      <div className="st-warn-card">
        <p className="st-warn-title" style={{ color: 'var(--absent-text)' }}>
          출석이 취소되었어요
        </p>
        <p className="st-alert-line" role="alert">
          <span className="st-bang" aria-hidden="true">
            !
          </span>
          같은 기기로 다른 계정이 출석했어요
        </p>
        <p className="st-note" style={{ color: 'var(--text-2)' }}>
          한 기기로는 한 사람만 출석할 수 있어요. 잘못된 처리라면 문의해 주세요.
        </p>
      </div>
      <PenaltyBox />
      <Link to={`/support?category=${encodeURIComponent('출석 불가')}&sessionId=${session.id}`} className="st-link-center">
        문제가 있으면 문의하기
      </Link>
    </>
  );
}

/** 빨간 경고 상자 (대리 출석 불이익) */
function PenaltyBox() {
  return (
    <div className="st-penalty" role="note">
      <IconWarning size={22} />
      <div>
        <p className="t1">대리 출석의 경우 벌점, 수료 불가, 출석 취소 등 불이익이 있습니다.</p>
        <p className="t2">같은 기기로 두 계정이 출석하면 기기 주인이 아닌 계정의 출석이 취소됩니다.</p>
      </div>
    </div>
  );
}

/** "오늘 수업" 목록 한 줄 */
function SessionRow({ session, isCurrent, now }: { session: TodaySession; isCurrent: boolean; now: string }) {
  // 아직 출석 시작 전인 미출 수업은 "예정"으로 보여 준다
  const upcoming = session.status === 'none' && now < session.attendFrom;
  return (
    <div className={`st-session-row${isCurrent ? ' current' : ''}`}>
      <span className="st-period">{session.period}교시</span>
      <div className="st-session-info">
        <p className="name">{session.courseName}</p>
        <p className="meta">
          {session.locationName} · {session.startTime}–{session.endTime}
        </p>
      </div>
      {upcoming ? (
        <span className="badge" style={{ background: '#f1f5f9', color: 'var(--muted)', fontWeight: 500 }}>
          예정
        </span>
      ) : (
        <span className={`badge ${session.status}`}>{STATUS_LABEL[session.status]}</span>
      )}
    </div>
  );
}
