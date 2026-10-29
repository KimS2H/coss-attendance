// ─────────────────────────────────────────────
// A-03 계정·학교 코드.
//  위: 학교 표 — 학교 추가·이름 변경, 학교 코드(4자리) 변경
//      GET/POST/PATCH /api/admin/schools, PUT /api/admin/schools/:id/code { code }
//      (학교 코드 값 자체는 보안상 서버가 돌려주지 않는다. 설정 여부와 변경일만 보인다)
//  아래: 인솔자 표 — 추가·수정, 활성 켜기/끄기
//      GET/POST/PATCH /api/admin/staff
// ─────────────────────────────────────────────
import { useState, type FormEvent } from 'react';
import { api } from '../../api/client';
import type { AdminSchool, AdminStaff, StaffInput } from '../../api/types';
import { adminError, fmtDateTime, PERMISSION_LABEL } from '../../components/admin/format';
import { useLoad } from '../../components/admin/hooks';
import { Alert, LoadError, Modal, PageHead } from '../../components/admin/ui';

export default function AccountsPage() {
  const schools = useLoad(() => api.get<AdminSchool[]>('/api/admin/schools'), []);
  const staff = useLoad(() => api.get<AdminStaff[]>('/api/admin/staff'), []);

  return (
    <>
      <PageHead title="계정·학교 코드" desc="참여 학교와 학교 코드, 인솔자 계정을 관리해요." />
      <SchoolsSection schools={schools.data ?? []} error={schools.error} loading={schools.loading} reload={schools.reload} />
      <StaffSection staff={staff.data ?? []} schools={schools.data ?? []} error={staff.error} loading={staff.loading} reload={staff.reload} />
    </>
  );
}

// ───────────── 학교 ─────────────

function SchoolsSection(props: { schools: AdminSchool[]; error: string | null; loading: boolean; reload: () => void }) {
  // 열린 팝업: 학교 추가 / 이름 변경 / 코드 변경
  const [modal, setModal] = useState<{ kind: 'add' } | { kind: 'rename'; school: AdminSchool } | { kind: 'code'; school: AdminSchool } | null>(null);
  const close = () => setModal(null);
  const done = () => {
    setModal(null);
    props.reload();
  };

  return (
    <section className="adm-section" aria-label="학교">
      <div className="adm-section-head">
        <h2>학교</h2>
        <button type="button" className="btn sm" onClick={() => setModal({ kind: 'add' })}>
          학교 추가
        </button>
      </div>
      <p className="adm-help">인솔자는 로그인할 때 학교 코드 4자리로 2차 인증을 해요. 학교 코드는 총관리자만 바꿀 수 있어요.</p>
      {props.error && <LoadError message={props.error} onRetry={props.reload} />}
      <div className="table-wrap">
        <table className="table" style={{ minWidth: 680 }}>
          <thead>
            <tr>
              <th scope="col">학교</th>
              <th scope="col" className="num">학생</th>
              <th scope="col" className="num">인솔자</th>
              <th scope="col">학교 코드</th>
              <th scope="col">관리</th>
            </tr>
          </thead>
          <tbody>
            {props.schools.map((s) => (
              <tr key={s.id}>
                <td style={{ fontWeight: 500 }}>{s.name}</td>
                <td className="num">{s.studentCount}</td>
                <td className="num">{s.staffCount}</td>
                <td>
                  {s.codeSet ? <span className="adm-chip ok">설정됨</span> : <span className="adm-chip danger">미설정</span>}
                  {s.codeChangedAt && <span className="adm-small"> · 변경 {fmtDateTime(s.codeChangedAt)}</span>}
                </td>
                <td>
                  <div className="adm-row" style={{ gap: 6 }}>
                    <button type="button" className="btn secondary sm" onClick={() => setModal({ kind: 'rename', school: s })}>
                      이름 변경
                    </button>
                    <button type="button" className="btn outline sm" onClick={() => setModal({ kind: 'code', school: s })}>
                      코드 변경
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {props.schools.length === 0 && (
              <tr>
                <td colSpan={5} className="adm-empty">
                  {props.loading ? '불러오는 중…' : '등록된 학교가 없어요. "학교 추가"를 눌러 주세요.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {modal?.kind === 'add' && <SchoolNameModal onClose={close} onDone={done} />}
      {modal?.kind === 'rename' && <SchoolNameModal school={modal.school} onClose={close} onDone={done} />}
      {modal?.kind === 'code' && <SchoolCodeModal school={modal.school} onClose={close} onDone={done} />}
    </section>
  );
}

/** 학교 추가(school 없음) 또는 이름 변경(school 있음) 팝업 */
function SchoolNameModal({ school, onClose, onDone }: { school?: AdminSchool; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(school?.name ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError('학교 이름을 입력해 주세요.');
    setBusy(true);
    setError(null);
    try {
      if (school) await api.patch<AdminSchool>(`/api/admin/schools/${school.id}`, { name: name.trim() });
      else await api.post<AdminSchool>('/api/admin/schools', { name: name.trim() });
      onDone();
    } catch (err) {
      setError(adminError(err));
      setBusy(false);
    }
  }

  return (
    <Modal title={school ? '학교 이름 변경' : '학교 추가'} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="field">
          <label className="label" htmlFor="school-name">학교 이름</label>
          <input id="school-name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        {!school && <p className="adm-help">추가한 뒤 "코드 변경"으로 학교 코드 4자리를 꼭 정해 주세요.</p>}
        {error && <Alert kind="error">{error}</Alert>}
        <div className="adm-row end" style={{ marginTop: 12 }}>
          <button type="button" className="btn secondary" onClick={onClose}>취소</button>
          <button type="submit" className="btn" disabled={busy}>{busy ? '저장 중…' : '저장'}</button>
        </div>
      </form>
    </Modal>
  );
}

/** 학교 코드 변경 팝업 (숫자 4자리, 잘못 입력하지 않게 두 번 입력) */
function SchoolCodeModal({ school, onClose, onDone }: { school: AdminSchool; onClose: () => void; onDone: () => void }) {
  const [code, setCode] = useState('');
  const [code2, setCode2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!/^\d{4}$/.test(code)) return setError('숫자 4자리로 입력해 주세요.');
    if (code !== code2) return setError('두 번 입력한 코드가 달라요.');
    setBusy(true);
    setError(null);
    try {
      await api.put<AdminSchool>(`/api/admin/schools/${school.id}/code`, { code });
      onDone();
    } catch (err) {
      setError(adminError(err));
      setBusy(false);
    }
  }

  const digits = (v: string) => v.replace(/\D/g, '').slice(0, 4);
  return (
    <Modal title={`${school.name} 학교 코드 변경`} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="adm-form-grid">
          <div className="field">
            <label className="label" htmlFor="code1">새 학교 코드 (숫자 4자리)</label>
            <input id="code1" className="input adm-code-input" inputMode="numeric" autoComplete="off" value={code} onChange={(e) => setCode(digits(e.target.value))} autoFocus />
          </div>
          <div className="field">
            <label className="label" htmlFor="code2">한 번 더 입력</label>
            <input id="code2" className="input adm-code-input" inputMode="numeric" autoComplete="off" value={code2} onChange={(e) => setCode2(digits(e.target.value))} />
          </div>
        </div>
        <Alert kind="warn">바꾼 코드는 해당 학교 인솔자에게 직접 알려 주세요. 자동으로 바뀌지 않아요.</Alert>
        {error && (
          <div style={{ marginTop: 10 }}>
            <Alert kind="error">{error}</Alert>
          </div>
        )}
        <div className="adm-row end" style={{ marginTop: 12 }}>
          <button type="button" className="btn secondary" onClick={onClose}>취소</button>
          <button type="submit" className="btn" disabled={busy}>{busy ? '저장 중…' : '코드 변경'}</button>
        </div>
      </form>
    </Modal>
  );
}

// ───────────── 인솔자 ─────────────

function StaffSection(props: { staff: AdminStaff[]; schools: AdminSchool[]; error: string | null; loading: boolean; reload: () => void }) {
  const [schoolFilter, setSchoolFilter] = useState('');
  const [editing, setEditing] = useState<AdminStaff | 'new' | null>(null); // 열린 입력 팝업
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const rows = props.staff.filter((s) => !schoolFilter || String(s.schoolId) === schoolFilter);

  // 활성 켜기/끄기: 나머지 값은 그대로 두고 isActive 만 바꿔서 보낸다
  async function toggleActive(s: AdminStaff) {
    setTogglingId(s.id);
    setToggleError(null);
    try {
      const input: StaffInput = { schoolId: s.schoolId, staffNo: s.staffNo, name: s.name, email: s.email, permission: s.permission, isActive: !s.isActive };
      await api.patch<AdminStaff>(`/api/admin/staff/${s.id}`, input);
      props.reload();
    } catch (e) {
      setToggleError(adminError(e));
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <section className="adm-section" aria-label="인솔자">
      <div className="adm-section-head">
        <h2>인솔자</h2>
        <div className="adm-row">
          <select className="select" style={{ width: 180, minHeight: 40 }} value={schoolFilter} onChange={(e) => setSchoolFilter(e.target.value)} aria-label="학교로 거르기">
            <option value="">전체 학교</option>
            {props.schools.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button type="button" className="btn sm" onClick={() => setEditing('new')} disabled={props.schools.length === 0}>
            인솔자 추가
          </button>
        </div>
      </div>
      <p className="adm-help">권한 "보기"는 출석 현황만 볼 수 있고, "수정"은 학생·수강 정보 수정과 출결 변경 신청도 할 수 있어요. 비활성 계정은 로그인할 수 없어요.</p>
      {props.error && <LoadError message={props.error} onRetry={props.reload} />}
      {toggleError && <Alert kind="error">{toggleError}</Alert>}
      <div className="table-wrap">
        <table className="table" style={{ minWidth: 820 }}>
          <thead>
            <tr>
              <th scope="col">학교</th>
              <th scope="col">직번</th>
              <th scope="col">이름</th>
              <th scope="col">이메일</th>
              <th scope="col">권한</th>
              <th scope="col">활성</th>
              <th scope="col">관리</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id} style={s.isActive ? undefined : { color: 'var(--muted)' }}>
                <td>{s.schoolName}</td>
                <td>{s.staffNo}</td>
                <td style={{ fontWeight: 500 }}>{s.name}</td>
                <td>{s.email}</td>
                <td>
                  <span className={`adm-chip ${s.permission === 'edit' ? 'info' : ''}`}>{PERMISSION_LABEL[s.permission]}</span>
                </td>
                <td>
                  <button
                    type="button"
                    className={`adm-switch ${s.isActive ? 'on' : ''}`}
                    role="switch"
                    aria-checked={s.isActive}
                    aria-label={`${s.name} 활성`}
                    disabled={togglingId === s.id}
                    onClick={() => toggleActive(s)}
                  />
                </td>
                <td>
                  <button type="button" className="btn secondary sm" onClick={() => setEditing(s)}>
                    수정
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="adm-empty">
                  {props.loading ? '불러오는 중…' : '등록된 인솔자가 없어요. "인솔자 추가" 또는 엑셀 등록을 이용하세요.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {editing && (
        <StaffModal
          staff={editing === 'new' ? undefined : editing}
          schools={props.schools}
          defaultSchoolId={schoolFilter}
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

/** 인솔자 추가·수정 팝업 */
function StaffModal(props: { staff?: AdminStaff; schools: AdminSchool[]; defaultSchoolId: string; onClose: () => void; onDone: () => void }) {
  const s = props.staff;
  const [schoolId, setSchoolId] = useState(s ? String(s.schoolId) : props.defaultSchoolId || String(props.schools[0]?.id ?? ''));
  const [staffNo, setStaffNo] = useState(s?.staffNo ?? '');
  const [name, setName] = useState(s?.name ?? '');
  const [email, setEmail] = useState(s?.email ?? '');
  const [permission, setPermission] = useState<'view' | 'edit'>(s?.permission ?? 'edit');
  const [isActive, setIsActive] = useState(s?.isActive ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!schoolId || !staffNo.trim() || !name.trim() || !email.trim()) return setError('학교, 직번, 이름, 이메일을 모두 입력해 주세요.');
    setBusy(true);
    setError(null);
    const input: StaffInput = { schoolId: Number(schoolId), staffNo: staffNo.trim(), name: name.trim(), email: email.trim(), permission, isActive };
    try {
      if (s) await api.patch<AdminStaff>(`/api/admin/staff/${s.id}`, input);
      else await api.post<AdminStaff>('/api/admin/staff', input);
      props.onDone();
    } catch (err) {
      setError(adminError(err));
      setBusy(false);
    }
  }

  return (
    <Modal title={s ? '인솔자 수정' : '인솔자 추가'} onClose={props.onClose}>
      <form onSubmit={submit}>
        <div className="field">
          <label className="label" htmlFor="st-school">학교</label>
          <select id="st-school" className="select" value={schoolId} onChange={(e) => setSchoolId(e.target.value)}>
            {props.schools.map((sc) => (
              <option key={sc.id} value={sc.id}>
                {sc.name}
              </option>
            ))}
          </select>
        </div>
        <div className="adm-form-grid">
          <div className="field">
            <label className="label" htmlFor="st-no">직번</label>
            <input id="st-no" className="input" value={staffNo} onChange={(e) => setStaffNo(e.target.value)} />
          </div>
          <div className="field">
            <label className="label" htmlFor="st-name">이름</label>
            <input id="st-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label className="label" htmlFor="st-email">이메일 (알림 받을 주소)</label>
          <input id="st-email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label className="label" htmlFor="st-perm">권한</label>
          <select id="st-perm" className="select" value={permission} onChange={(e) => setPermission(e.target.value as 'view' | 'edit')}>
            <option value="edit">수정 (학생·수강 수정, 출결 변경 신청 가능)</option>
            <option value="view">보기 (출석 현황만)</option>
          </select>
        </div>
        <label className="adm-check">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          활성 (끄면 로그인할 수 없어요)
        </label>
        {error && <Alert kind="error">{error}</Alert>}
        <div className="adm-row end" style={{ marginTop: 12 }}>
          <button type="button" className="btn secondary" onClick={props.onClose}>취소</button>
          <button type="submit" className="btn" disabled={busy}>{busy ? '저장 중…' : '저장'}</button>
        </div>
      </form>
    </Modal>
  );
}
