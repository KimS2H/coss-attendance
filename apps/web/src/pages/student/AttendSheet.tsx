// S-04 출석 코드 입력 창 (아래에서 올라오는 창) + S-05 실패 안내 창.
//
// 출석 순서:
//  1) 창이 열리자마자 휴대폰 위치(GPS)를 확인한다 (위치 동의를 안 했으면 건너뜀)
//  2) 학생이 강의실 화면의 숫자 4자리를 입력하고 "확인"
//  3) POST /api/student/attendance → 결과(result)를 부모 화면(MainPage)에 넘긴다
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../../api/client';
import type { AttendRequest, AttendResponse, AttendResult, TodaySession } from '../../api/types';
import { DigitInputs } from '../../components/DigitInputs';
import { fmtTime } from '../../components/format';
import { IconCheck, IconClock, IconPinAlert, IconWarning, IconX } from '../../components/Icons';
import { loadLocationConsent } from './storage';

type Geo =
  | { state: 'locating' }
  | { state: 'ok'; lat: number; lng: number; accuracy: number }
  | { state: 'fail'; reason: string }
  | { state: 'off' }; // 위치 동의 안 함

/** 코드 입력 창 */
export function CodeSheet({
  session,
  onClose,
  onResult,
}: {
  session: TodaySession;
  onClose: () => void;
  onResult: (res: AttendResponse, accuracy: number | null) => void;
}) {
  const [geo, setGeo] = useState<Geo>(() => (loadLocationConsent() ? { state: 'locating' } : { state: 'off' }));
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // 1) 창이 열리면 바로 위치 확인 시작
  useEffect(() => {
    if (!loadLocationConsent()) return;
    if (!('geolocation' in navigator)) {
      setGeo({ state: 'fail', reason: '이 브라우저는 위치 확인을 지원하지 않아요' });
      return;
    }
    let cancelled = false; // 창이 닫힌 뒤 결과가 오면 무시
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (cancelled) return;
        setGeo({
          state: 'ok',
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy),
        });
      },
      (err) => {
        if (cancelled) return;
        const reason =
          err.code === err.PERMISSION_DENIED
            ? '위치 권한이 꺼져 있어요. 휴대폰 설정에서 허용해 주세요'
            : err.code === err.TIMEOUT
              ? '위치 확인 시간이 너무 오래 걸렸어요'
              : '위치 신호를 받지 못했어요';
        setGeo({ state: 'fail', reason });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  // 3) 서버에 출석 요청
  async function submit() {
    if (code.length !== 4 || busy || geo.state === 'locating') return;
    setBusy(true);
    setError('');
    const body: AttendRequest = {
      sessionId: session.id,
      code,
      // 위치 동의를 안 했거나 위치를 못 가져왔으면 null
      location: geo.state === 'ok' ? { lat: geo.lat, lng: geo.lng, accuracy: geo.accuracy } : null,
    };
    try {
      const res = await api.post<AttendResponse>('/api/student/attendance', body);
      onResult(res, geo.state === 'ok' ? geo.accuracy : null);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <SheetFrame label="강의실 코드 입력" onClose={onClose}>
      {/* 1단계: 위치 확인 상태 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <GeoStep geo={geo} locationName={session.locationName} />
        <div className="st-step">
          <span className="st-step-dot num">2</span>
          <p className="t" style={{ color: 'var(--navy-dark)' }}>
            강의실 코드 입력
          </p>
        </div>
      </div>

      {/* 2단계: 숫자 4자리 */}
      <fieldset style={{ margin: 0, padding: 0, border: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <legend style={{ padding: 0, marginBottom: 14, fontSize: 20, fontWeight: 700, lineHeight: 1.4 }}>
          강의실 화면의 숫자 4자리를 입력하세요
        </legend>
        <DigitInputs value={code} onChange={setCode} autoFocus onEnter={() => void submit()} labelPrefix="강의실 코드 " />
        <p className="st-note">코드는 30초마다 바뀌어요. 바뀌었다면 새 코드를 입력하세요.</p>
      </fieldset>

      {error && (
        <p className="st-error" role="alert" style={{ margin: 0 }}>
          {error}
        </p>
      )}

      <div className="st-sheet-buttons">
        <button type="button" className="btn secondary block" onClick={onClose}>
          취소
        </button>
        <button
          type="button"
          className="btn block"
          disabled={code.length !== 4 || busy || geo.state === 'locating'}
          onClick={() => void submit()}
        >
          {busy ? '확인 중…' : geo.state === 'locating' ? '위치 확인 중…' : '확인'}
        </button>
      </div>
    </SheetFrame>
  );
}

/** 위치 확인 단계 한 줄 */
function GeoStep({ geo, locationName }: { geo: Geo; locationName: string }) {
  if (geo.state === 'locating') {
    return (
      <div className="st-step" aria-live="polite">
        <span className="st-step-dot wait">
          <IconClock size={16} />
        </span>
        <div>
          <p className="t" style={{ color: 'var(--navy)' }}>
            위치 확인 중…
          </p>
          <p className="s">{locationName} 근처인지 확인하고 있어요</p>
        </div>
      </div>
    );
  }
  if (geo.state === 'ok') {
    return (
      <div className="st-step" aria-live="polite">
        <span className="st-step-dot ok">
          <IconCheck size={16} strokeWidth={3} />
        </span>
        <div>
          <p className="t" style={{ color: 'var(--present-text)' }}>
            위치 확인 완료
          </p>
          <p className="s">정확도 ±{geo.accuracy}m</p>
        </div>
      </div>
    );
  }
  if (geo.state === 'off') {
    return (
      <div className="st-step">
        <span className="st-step-dot bad">
          <IconX size={16} strokeWidth={3} />
        </span>
        <div>
          <p className="t" style={{ color: 'var(--late-text)' }}>
            위치 확인 안 함
          </p>
          <p className="s">위치 동의를 하지 않아 위치 없이 보내요 (담당자 확인 필요)</p>
        </div>
      </div>
    );
  }
  return (
    <div className="st-step" aria-live="polite">
      <span className="st-step-dot bad">
        <IconX size={16} strokeWidth={3} />
      </span>
      <div>
        <p className="t" style={{ color: 'var(--late-text)' }}>
          위치를 가져오지 못했어요
        </p>
        <p className="s">{geo.reason}</p>
      </div>
    </div>
  );
}

/** 실패 결과별 제목 */
const FAIL_TITLE: Partial<Record<AttendResult, string>> = {
  too_early: '아직 출석 시간이 아니에요',
  closed: '수업이 끝났어요',
  out_of_range: '출석 장소에서 멀어요',
  gps_denied: '위치 권한이 필요해요',
  code_wrong: '강의실 코드가 맞지 않아요',
  not_enrolled: '수강 정보가 없어요',
};

/** 실패 결과별 도움말 */
const FAIL_TIP: Partial<Record<AttendResult, string>> = {
  out_of_range: '창가 쪽으로 이동하거나 와이파이를 켜면 위치가 더 정확해져요.',
  gps_denied: '휴대폰 설정 → 브라우저(또는 앱) → 위치 권한을 "허용"으로 바꾼 뒤 다시 시도해 주세요.',
  code_wrong: '강의실 화면의 숫자가 바뀌었는지 확인하고 새 코드를 입력하세요.',
  not_enrolled: '이 수업의 수강 정보가 없어요. 담당자에게 문의해 주세요.',
};

/** 문의할 때 미리 골라 둘 분류 */
export function categoryFor(result: AttendResult): string {
  if (result === 'out_of_range' || result === 'gps_denied') return '위치 인식 불가';
  if (result === 'code_wrong') return '코드 입력 불가';
  return '출석 불가';
}

/** "09:55" 또는 ISO 시각 → "09:55" */
function asHHMM(v: string) {
  return v.includes('T') ? fmtTime(v) : v;
}

/** S-05 실패 안내 창 */
export function FailSheet({
  session,
  res,
  accuracy,
  onRetry,
  onClose,
}: {
  session: TodaySession;
  res: AttendResponse;
  accuracy: number | null;
  onRetry: () => void;
  onClose: () => void;
}) {
  const supportUrl = `/support?category=${encodeURIComponent(categoryFor(res.result))}&sessionId=${session.id}`;
  const isLocation = res.result === 'out_of_range' || res.result === 'gps_denied';

  return (
    <SheetFrame label="출석 실패" onClose={onClose} alert>
      <div className="st-fail-icon">{isLocation ? <IconPinAlert size={30} /> : res.result === 'too_early' ? <IconClock size={30} /> : <IconWarning size={30} />}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: 21, fontWeight: 700 }}>{FAIL_TITLE[res.result] ?? '출석하지 못했어요'}</h2>
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: 'var(--text-2)' }}>{res.message}</p>
      </div>

      {/* 거리 문제일 때: 허용 반경 / 현재 거리 / GPS 정확도 */}
      {res.result === 'out_of_range' && (
        <dl className="st-dl">
          <dt>허용 반경</dt>
          <dd>{res.radiusM}m</dd>
          <dt>현재 거리</dt>
          <dd style={{ color: '#c2410c', fontWeight: 700 }}>{res.distanceM !== null ? `약 ${res.distanceM}m` : '-'}</dd>
          {accuracy !== null && (
            <>
              <dt>GPS 정확도</dt>
              <dd>±{accuracy}m</dd>
            </>
          )}
        </dl>
      )}
      {res.result === 'too_early' && res.attendFrom && (
        <dl className="st-dl">
          <dt>출석 시작</dt>
          <dd>{asHHMM(res.attendFrom)}부터</dd>
        </dl>
      )}

      {FAIL_TIP[res.result] && <p className="st-note">{FAIL_TIP[res.result]}</p>}

      <button type="button" className="btn block" onClick={onRetry}>
        다시 시도
      </button>
      <Link to={supportUrl} className="st-link-center">
        계속 안 되면 문의하기
      </Link>
    </SheetFrame>
  );
}

/** 아래에서 올라오는 창의 공통 틀 (회색 바탕 + 흰 창) */
function SheetFrame({
  label,
  onClose,
  alert = false,
  children,
}: {
  label: string;
  onClose: () => void;
  alert?: boolean;
  children: React.ReactNode;
}) {
  // Esc 키로 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="st-sheet-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="st-sheet" role={alert ? 'alertdialog' : 'dialog'} aria-modal="true" aria-label={label}>
        <div className="st-sheet-handle" />
        {children}
      </div>
    </div>
  );
}
