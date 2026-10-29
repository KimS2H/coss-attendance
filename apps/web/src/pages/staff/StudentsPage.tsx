// 학생·수강 관리.
// - 담당 학교 학생 목록 (검색)
// - 학생 추가·수정, 등록 기기 초기화 (폰 교체·분실)
// - "전체 학생 수강 등록": 담당 학교 학생 전원을 모든 수업에 수강 등록
import { useCallback, useEffect, useState } from 'react';
import { api, ApiRequestError, errorMessage } from '../../api/client';
import type { StudentInput, StudentRow } from '../../api/types';
import { Modal } from '../../components/Modal';
import { useStaff } from './context';

export default function StudentsPage() {
  const { canEdit } = useStaff();
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [rows, setRows] = useState<StudentRow[] | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<StudentRow | 'new' | null>(null);
  const [busy, setBusy] = useState(false);

  // 검색어는 입력을 멈춘 뒤 0.3초 후 반영
  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => window.clearTimeout(id);
  }, [q]);

  const load = useCallback(async () => {
    try {
      const url = debouncedQ ? `/api/staff/students?q=${encodeURIComponent(debouncedQ)}` : '/api/staff/students';
      setRows(await api.get<StudentRow[]>(url));
      setError('');
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [debouncedQ]);

  useEffect(() => {
    void load();
  }, [load]);

  async function resetDevice(s: StudentRow) {
    if (!window.confirm(`${s.name}(${s.studentNo})의 등록 기기를 초기화할까요?\n\n폰을 바꾸거나 잃어버린 경우에만 하세요. 다음 로그인한 기기가 새로 등록돼요.`)) return;
    setNotice('');
    setError('');
    try {
      await api.post(`/api/staff/students/${s.id}/device-reset`);
      setNotice(`${s.name}의 등록 기기를 초기화했어요. 다음 로그인한 기기가 새로 등록돼요.`);
      void load();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function enrollAll() {
    if (!window.confirm('담당 학교 학생 전원을 모든 수업에 수강 등록할까요?\n이미 등록된 수강은 그대로 두고, 빠진 것만 추가돼요.')) return;
    setBusy(true);
    setNotice('');
    setError('');
    try {
      const res = await api.post<{ created: number }>('/api/staff/enrollments/all');
      setNotice(`수강 ${res.created}건을 새로 등록했어요.`);
      void load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="sf-title-row">
        <div>
          <h1 className="sf-title">학생·수강 관리</h1>
          <p className="sf-sub">담당 학교 학생과 수강 정보를 관리해요. 여러 명은 "엑셀 등록"이 편해요.</p>
        </div>
        {canEdit && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button type="button" className="btn secondary" disabled={busy} onClick={() => void enrollAll()}>
              전체 학생 수강 등록
            </button>
            <button type="button" className="btn" onClick={() => setEditing('new')}>
              학생 추가
            </button>
          </div>
        )}
      </div>

      <div className="sf-filters">
        <div className="field" style={{ flex: '1 1 260px' }}>
          <label className="label" htmlFor="s-search">
            검색
          </label>
          <input id="s-search" className="input" type="search" placeholder="학번 또는 이름" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {error && <p className="sf-alert">{error}</p>}
      {notice && <p className="sf-ok">{notice}</p>}

      <div className="table-wrap">
        <table className="table" style={{ minWidth: 860 }}>
          <thead>
            <tr>
              <th scope="col">학번</th>
              <th scope="col">이름</th>
              <th scope="col">단과대</th>
              <th scope="col">학과</th>
              <th scope="col">등록 기기</th>
              <th scope="col">수강 회차</th>
              <th scope="col">상태</th>
              {canEdit && (
                <th scope="col">
                  관리
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows === null && (
              <tr>
                <td colSpan={8} className="sf-empty">
                  불러오는 중…
                </td>
              </tr>
            )}
            {rows?.length === 0 && (
              <tr>
                <td colSpan={8} className="sf-empty">
                  학생이 없어요.
                </td>
              </tr>
            )}
            {rows?.map((s) => (
              <tr key={s.id} style={s.isActive ? undefined : { color: 'var(--muted)' }}>
                <td>{s.studentNo}</td>
                <td style={{ fontWeight: 500 }}>{s.name}</td>
                <td>{s.college}</td>
                <td>{s.department}</td>
                <td>{s.deviceStatus === 'registered' ? <span className="badge present">있음</span> : <span className="badge none">없음</span>}</td>
                <td>{s.enrolledSessions}회</td>
                <td>{s.isActive ? '사용' : <span className="badge absent">사용 안 함</span>}</td>
                {canEdit && (
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <span style={{ display: 'inline-flex', gap: 6 }}>
                      <button type="button" className="sf-small-btn" onClick={() => setEditing(s)}>
                        수정
                      </button>
                      <button
                        type="button"
                        className="sf-small-btn danger"
                        disabled={s.deviceStatus !== 'registered'}
                        onClick={() => void resetDevice(s)}
                      >
                        기기 초기화
                      </button>
                    </span>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <StudentForm
          student={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(saved, isNew) => {
            setEditing(null);
            setNotice(isNew ? `${saved.name} 학생을 추가했어요. 수강 등록도 확인하세요.` : `${saved.name} 학생 정보를 저장했어요.`);
            void load();
          }}
        />
      )}
    </>
  );
}

/** 학생 추가·수정 창 */
function StudentForm({
  student,
  onClose,
  onSaved,
}: {
  student: StudentRow | null; // null이면 새 학생
  onClose: () => void;
  onSaved: (s: StudentRow, isNew: boolean) => void;
}) {
  const [form, setForm] = useState<StudentInput>({
    studentNo: student?.studentNo ?? '',
    name: student?.name ?? '',
    college: student?.college ?? '',
    department: student?.department ?? '',
    isActive: student?.isActive ?? true,
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k: keyof StudentInput, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setFieldErrors({});
    const body: StudentInput = {
      studentNo: form.studentNo.trim(),
      name: form.name.trim(),
      college: form.college.trim(),
      department: form.department.trim(),
      isActive: form.isActive,
    };
    if (!body.studentNo || !body.name) return setError('학번과 이름은 꼭 입력하세요.');
    setBusy(true);
    try {
      const saved = student
        ? await api.patch<StudentRow>(`/api/staff/students/${student.id}`, body)
        : await api.post<StudentRow>('/api/staff/students', body);
      onSaved(saved, !student);
    } catch (err) {
      setError(errorMessage(err));
      // 칸별 오류가 있으면 칸 아래에 보여 준다
      if (err instanceof ApiRequestError && err.fields) setFieldErrors(err.fields);
      setBusy(false);
    }
  }

  const input = (k: 'studentNo' | 'name' | 'college' | 'department', label: string, placeholder: string) => (
    <div className="field">
      <label className="label" htmlFor={`st-${k}`}>
        {label}
      </label>
      <input id={`st-${k}`} className="input" value={form[k]} placeholder={placeholder} onChange={(e) => set(k, e.target.value)} />
      {fieldErrors[k] && <span className="error-text">{fieldErrors[k]}</span>}
    </div>
  );

  return (
    <Modal title={student ? `학생 정보 수정 · ${student.name}` : '학생 추가'} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        {input('studentNo', '학번', '예: 20231234')}
        {input('name', '이름', '예: 홍길동')}
        {input('college', '단과대', '예: 공과대학')}
        {input('department', '학과', '예: 컴퓨터공학과')}
        {student && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, fontSize: 15 }}>
            <input type="checkbox" checked={form.isActive ?? true} onChange={(e) => set('isActive', e.target.checked)} style={{ width: 20, height: 20 }} />
            사용 중 (끄면 로그인·출석할 수 없어요)
          </label>
        )}
        {error && <p className="sf-alert" style={{ margin: '8px 0' }}>{error}</p>}
        <div className="sf-actions" style={{ marginTop: 12 }}>
          <button type="button" className="btn secondary" onClick={onClose}>
            취소
          </button>
          <button type="submit" className="btn" disabled={busy}>
            {busy ? '저장 중…' : '저장'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
