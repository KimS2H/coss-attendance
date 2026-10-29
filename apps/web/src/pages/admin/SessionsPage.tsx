// ─────────────────────────────────────────────
// A-04 장소·일정.
//  위: 장소 표 — 강의실 좌표(위도·경도)와 허용 반경(m). 출석할 때 이 반경 안에 있어야 한다.
//      GET/POST/PATCH /api/admin/locations  (삭제 API 는 없음)
//  아래: 수업 일정 표 — 기간을 골라 보고, 추가·수정·삭제
//      GET /api/admin/sessions?from=&to=, POST, PATCH /:id, DELETE /:id
// ─────────────────────────────────────────────
import { useState, type FormEvent } from 'react';
import { api } from '../../api/client';
import type { AdminLocation, AdminSession, LocationInput, SessionInput } from '../../api/types';
import { addDays, adminError, fmtDateLabel, todayKST } from '../../components/admin/format';
import { useLoad } from '../../components/admin/hooks';
import { Alert, LoadError, Modal, PageHead } from '../../components/admin/ui';

export default function SessionsPage() {
  const locations = useLoad(() => api.get<AdminLocation[]>('/api/admin/locations'), []);
  return (
    <>
      <PageHead title="장소·일정" desc="강의실 좌표와 수업 일정을 관리해요. 엑셀로 한 번에 올리려면 '엑셀 등록' 메뉴를 이용하세요." />
      <LocationsSection locations={locations.data ?? []} error={locations.error} loading={locations.loading} reload={locations.reload} />
      <SessionsSection locations={locations.data ?? []} />
    </>
  );
}

// ───────────── 장소 ─────────────

function LocationsSection(props: { locations: AdminLocation[]; error: string | null; loading: boolean; reload: () => void }) {
  const [editing, setEditing] = useState<AdminLocation | 'new' | null>(null);
  return (
    <section className="adm-section" aria-label="장소">
      <div className="adm-section-head">
        <h2>장소</h2>
        <button type="button" className="btn sm" onClick={() => setEditing('new')}>
          장소 추가
        </button>
      </div>
      {props.error && <LoadError message={props.error} onRetry={props.reload} />}
      <div className="table-wrap">
        <table className="table" style={{ minWidth: 640 }}>
          <thead>
            <tr>
              <th scope="col">이름</th>
              <th scope="col">위도</th>
              <th scope="col">경도</th>
              <th scope="col" className="num">허용 반경</th>
              <th scope="col">관리</th>
            </tr>
          </thead>
          <tbody>
            {props.locations.map((l) => (
              <tr key={l.id}>
                <td style={{ fontWeight: 500 }}>{l.name}</td>
                <td>{l.latitude}</td>
                <td>{l.longitude}</td>
                <td className="num">{l.radiusM}m</td>
                <td>
                  <div className="adm-row" style={{ gap: 6 }}>
                    <button type="button" className="btn secondary sm" onClick={() => setEditing(l)}>
                      수정
                    </button>
                    {/* 좌표가 맞는지 지도에서 확인 (새 창) */}
                    <a className="btn secondary sm" href={`https://www.google.com/maps?q=${l.latitude},${l.longitude}`} target="_blank" rel="noreferrer">
                      지도
                    </a>
                  </div>
                </td>
              </tr>
            ))}
            {props.locations.length === 0 && (
              <tr>
                <td colSpan={5} className="adm-empty">
                  {props.loading ? '불러오는 중…' : '등록된 장소가 없어요. 수업 일정보다 장소를 먼저 등록해 주세요.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {editing && (
        <LocationModal
          location={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            props.reload();
          }}
        />
      )}
    </section>
  );
}

/** 장소 추가·수정 팝업 */
function LocationModal({ location, onClose, onDone }: { location?: AdminLocation; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(location?.name ?? '');
  const [lat, setLat] = useState(location ? String(location.latitude) : '');
  const [lng, setLng] = useState(location ? String(location.longitude) : '');
  const [radius, setRadius] = useState(String(location?.radiusM ?? 50));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 지도 앱에서 복사한 "37.12345, 127.12345" 를 위도 칸에 붙여 넣으면 둘로 나눠 준다
  function onLatChange(v: string) {
    const m = v.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (m) {
      setLat(m[1]);
      setLng(m[2]);
    } else setLat(v);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const latitude = Number(lat);
    const longitude = Number(lng);
    const radiusM = Number(radius);
    if (!name.trim()) return setError('장소 이름을 입력해 주세요.');
    if (!lat.trim() || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) return setError('위도를 확인해 주세요. (예: 37.5665)');
    if (!lng.trim() || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) return setError('경도를 확인해 주세요. (예: 126.9780)');
    if (!Number.isInteger(radiusM) || radiusM < 1) return setError('허용 반경은 1 이상의 정수(m)로 입력해 주세요.');
    setBusy(true);
    setError(null);
    const input: LocationInput = { name: name.trim(), latitude, longitude, radiusM };
    try {
      if (location) await api.patch<AdminLocation>(`/api/admin/locations/${location.id}`, input);
      else await api.post<AdminLocation>('/api/admin/locations', input);
      onDone();
    } catch (err) {
      setError(adminError(err));
      setBusy(false);
    }
  }

  return (
    <Modal title={location ? '장소 수정' : '장소 추가'} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="field">
          <label className="label" htmlFor="loc-name">이름 (예: 공학관 301)</label>
          <input id="loc-name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <p className="adm-help" style={{ marginBottom: 10 }}>
          지도 앱에서 강의실 건물을 길게 눌러 좌표를 복사하세요. "위도, 경도"를 위도 칸에 그대로 붙여 넣어도 돼요.
        </p>
        <div className="adm-form-grid">
          <div className="field">
            <label className="label" htmlFor="loc-lat">위도</label>
            <input id="loc-lat" className="input" inputMode="decimal" value={lat} onChange={(e) => onLatChange(e.target.value)} placeholder="37.5665" />
          </div>
          <div className="field">
            <label className="label" htmlFor="loc-lng">경도</label>
            <input id="loc-lng" className="input" inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} placeholder="126.9780" />
          </div>
        </div>
        <div className="field">
          <label className="label" htmlFor="loc-r">허용 반경 (m, 기본 50)</label>
          <input id="loc-r" className="input" inputMode="numeric" value={radius} onChange={(e) => setRadius(e.target.value.replace(/\D/g, ''))} />
        </div>
        {error && <Alert kind="error">{error}</Alert>}
        <div className="adm-row end" style={{ marginTop: 12 }}>
          <button type="button" className="btn secondary" onClick={onClose}>취소</button>
          <button type="submit" className="btn" disabled={busy}>{busy ? '저장 중…' : '저장'}</button>
        </div>
      </form>
    </Modal>
  );
}

// ───────────── 수업 일정 ─────────────

function SessionsSection({ locations }: { locations: AdminLocation[] }) {
  // 보는 기간 (기본: 오늘 ~ 14일 뒤)
  const [from, setFrom] = useState(todayKST());
  const [to, setTo] = useState(addDays(todayKST(), 14));
  const { data, error, loading, reload } = useLoad(() => api.get<AdminSession[]>(`/api/admin/sessions?from=${from}&to=${to}`), [from, to]);
  const [editing, setEditing] = useState<AdminSession | 'new' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // 날짜 → 교시 순으로 정렬
  const rows = [...(data ?? [])].sort((a, b) => a.date.localeCompare(b.date) || a.period - b.period);

  async function remove(s: AdminSession) {
    const warn = s.enrolled > 0 ? `\n수강생 ${s.enrolled}명의 수강·출석 정보도 함께 사라질 수 있어요.` : '';
    if (!window.confirm(`${s.date} ${s.period}교시 ${s.courseName} 수업을 삭제할까요?${warn}`)) return;
    setActionError(null);
    try {
      await api.del(`/api/admin/sessions/${s.id}`);
      void reload();
    } catch (e) {
      setActionError(adminError(e));
    }
  }

  return (
    <section className="adm-section" aria-label="수업 일정">
      <div className="adm-section-head">
        <h2>수업 일정</h2>
        <button type="button" className="btn sm" onClick={() => setEditing('new')} disabled={locations.length === 0}>
          수업 추가
        </button>
      </div>
      <div className="adm-row">
        <label className="label" htmlFor="s-from" style={{ margin: 0 }}>기간</label>
        <input id="s-from" type="date" className="input" style={{ width: 170, minHeight: 40 }} value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} />
        <span>~</span>
        <input type="date" className="input" style={{ width: 170, minHeight: 40 }} value={to} onChange={(e) => e.target.value && setTo(e.target.value)} aria-label="기간 끝" />
      </div>
      {locations.length === 0 && <Alert kind="warn">장소를 먼저 등록해야 수업을 추가할 수 있어요.</Alert>}
      {error && <LoadError message={error} onRetry={reload} />}
      {actionError && <Alert kind="error">{actionError}</Alert>}
      <div className="table-wrap">
        <table className="table" style={{ minWidth: 780 }}>
          <thead>
            <tr>
              <th scope="col">날짜</th>
              <th scope="col">교시</th>
              <th scope="col">수업</th>
              <th scope="col">시간</th>
              <th scope="col">장소</th>
              <th scope="col" className="num">수강생</th>
              <th scope="col">관리</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id}>
                <td style={{ whiteSpace: 'nowrap' }}>{fmtDateLabel(s.date)}</td>
                <td>{s.period}교시</td>
                <td style={{ fontWeight: 500 }}>{s.courseName}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {s.startTime}–{s.endTime}
                </td>
                <td>{s.locationName}</td>
                <td className="num">{s.enrolled}</td>
                <td>
                  <div className="adm-row" style={{ gap: 6 }}>
                    <button type="button" className="btn secondary sm" onClick={() => setEditing(s)}>
                      수정
                    </button>
                    <button type="button" className="btn danger sm" onClick={() => remove(s)}>
                      삭제
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="adm-empty">
                  {loading ? '불러오는 중…' : '이 기간에 수업이 없어요.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {editing && (
        <SessionModal
          session={editing === 'new' ? undefined : editing}
          locations={locations}
          defaultDate={from}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            void reload();
          }}
        />
      )}
    </section>
  );
}

/** 수업 추가·수정 팝업 */
function SessionModal(props: { session?: AdminSession; locations: AdminLocation[]; defaultDate: string; onClose: () => void; onDone: () => void }) {
  const s = props.session;
  const [courseName, setCourseName] = useState(s?.courseName ?? '');
  const [date, setDate] = useState(s?.date ?? props.defaultDate);
  const [period, setPeriod] = useState(String(s?.period ?? 1));
  const [startTime, setStartTime] = useState(s?.startTime ?? '10:00');
  const [endTime, setEndTime] = useState(s?.endTime ?? '11:50');
  const [locationId, setLocationId] = useState(String(s?.locationId ?? props.locations[0]?.id ?? ''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const p = Number(period);
    if (!courseName.trim()) return setError('수업 이름을 입력해 주세요.');
    if (!date) return setError('날짜를 골라 주세요.');
    if (!Number.isInteger(p) || p < 1) return setError('교시는 1 이상의 숫자로 입력해 주세요.');
    if (!startTime || !endTime || endTime <= startTime) return setError('끝나는 시각이 시작 시각보다 늦어야 해요.');
    if (!locationId) return setError('장소를 골라 주세요.');
    setBusy(true);
    setError(null);
    const input: SessionInput = { courseName: courseName.trim(), date, period: p, startTime, endTime, locationId: Number(locationId) };
    try {
      if (s) await api.patch<AdminSession>(`/api/admin/sessions/${s.id}`, input);
      else await api.post<AdminSession>('/api/admin/sessions', input);
      props.onDone();
    } catch (err) {
      setError(adminError(err));
      setBusy(false);
    }
  }

  return (
    <Modal title={s ? '수업 수정' : '수업 추가'} onClose={props.onClose}>
      <form onSubmit={submit}>
        <div className="field">
          <label className="label" htmlFor="ss-name">수업 이름</label>
          <input id="ss-name" className="input" value={courseName} onChange={(e) => setCourseName(e.target.value)} autoFocus placeholder="AI 기초" />
        </div>
        <div className="adm-form-grid">
          <div className="field">
            <label className="label" htmlFor="ss-date">날짜</label>
            <input id="ss-date" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="field">
            <label className="label" htmlFor="ss-period">교시</label>
            <input id="ss-period" className="input" inputMode="numeric" value={period} onChange={(e) => setPeriod(e.target.value.replace(/\D/g, ''))} />
          </div>
          <div className="field">
            <label className="label" htmlFor="ss-start">시작 시각</label>
            <input id="ss-start" type="time" className="input" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>
          <div className="field">
            <label className="label" htmlFor="ss-end">끝나는 시각</label>
            <input id="ss-end" type="time" className="input" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label className="label" htmlFor="ss-loc">장소</label>
          <select id="ss-loc" className="select" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            {props.locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} (반경 {l.radiusM}m)
              </option>
            ))}
          </select>
        </div>
        <p className="adm-help">출석은 시작 5분 전 ~ 5분 후, 그 뒤 끝나는 시각까지는 지각으로 처리돼요.</p>
        {error && (
          <div style={{ marginTop: 10 }}>
            <Alert kind="error">{error}</Alert>
          </div>
        )}
        <div className="adm-row end" style={{ marginTop: 12 }}>
          <button type="button" className="btn secondary" onClick={props.onClose}>취소</button>
          <button type="submit" className="btn" disabled={busy}>{busy ? '저장 중…' : '저장'}</button>
        </div>
      </form>
    </Modal>
  );
}
