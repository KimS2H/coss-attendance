// S-01 로그인 화면 (학생·담당자 공동).
// 학생: 로그인 → 동의 화면 또는 출석 화면 / 담당자: 로그인 → 2차 인증(학교 코드) 화면
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../../api/client';
import type { School, StudentMe } from '../../api/types';
import { LogoBadge } from '../../components/Brand';
import { loadSavedUser, saveUser } from './storage';

type Role = 'student' | 'staff';

export default function LoginPage() {
  const navigate = useNavigate();
  // 저장해 둔 사용자 정보가 있으면 처음부터 채워 둔다
  const saved = loadSavedUser();
  const [role, setRole] = useState<Role>(saved?.role ?? 'student');
  const [schools, setSchools] = useState<School[]>([]);
  const [schoolId, setSchoolId] = useState<number | ''>(saved?.schoolId ?? '');
  const [idNo, setIdNo] = useState(saved?.idNo ?? '');
  const [name, setName] = useState(saved?.name ?? '');
  const [remember, setRemember] = useState(saved !== null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // 학교 목록 불러오기
  useEffect(() => {
    api
      .get<School[]>('/api/schools')
      .then((list) => {
        setSchools(list);
        // 저장된 학교가 없거나 목록에 없으면 첫 학교를 고른다
        setSchoolId((cur) => (cur !== '' && list.some((s) => s.id === cur) ? cur : (list[0]?.id ?? '')));
      })
      .catch((e) => setError(errorMessage(e)));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (schoolId === '') return setError('학교를 고르세요.');
    if (!idNo.trim()) return setError(role === 'student' ? '학번을 입력하세요.' : '직번을 입력하세요.');
    if (!name.trim()) return setError('이름을 입력하세요.');

    // "사용자 저장" 체크 여부에 따라 저장하거나 지운다
    saveUser(remember ? { role, schoolId, idNo: idNo.trim(), name: name.trim() } : null);

    setBusy(true);
    try {
      if (role === 'student') {
        const me = await api.post<StudentMe>('/api/auth/student/login', {
          schoolId,
          studentNo: idNo.trim(),
          name: name.trim(),
        });
        navigate(me.needsConsent ? '/consent' : '/', { replace: true });
      } else {
        await api.post<{ next: 'school_code' }>('/api/auth/staff/login', {
          schoolId,
          staffNo: idNo.trim(),
          name: name.trim(),
        });
        // 2차 인증 화면에서 "한국대 김담당님" 처럼 보여 주려고 이름을 넘긴다
        const schoolName = schools.find((s) => s.id === schoolId)?.name ?? '';
        navigate('/staff/verify', { state: { schoolName, name: name.trim() } });
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const idLabel = role === 'student' ? '학번' : '직번';

  return (
    <div className="st-page">
      {/* 남색 머리 부분: 큰 로고 + 서비스 이름 */}
      <div className="st-login-hero">
        <LogoBadge size={60} />
        <h1>
          🎓 IoT 혁신융합대학
          <br />
          비교과 출석체크
        </h1>
        <p>등록된 정보로 로그인해 주세요</p>
      </div>

      {/* 흰 카드: 로그인 입력 */}
      <form className="st-login-card" onSubmit={submit} noValidate>
        <div className="st-tabs" role="group" aria-label="사용자 구분">
          <button type="button" aria-pressed={role === 'student'} onClick={() => setRole('student')}>
            학생
          </button>
          <button type="button" aria-pressed={role === 'staff'} onClick={() => setRole('staff')}>
            담당자
          </button>
        </div>

        <div className="field">
          <label className="label" htmlFor="school">
            학교
          </label>
          <select
            id="school"
            className="select"
            value={schoolId}
            onChange={(e) => setSchoolId(e.target.value ? Number(e.target.value) : '')}
          >
            {schools.length === 0 && <option value="">불러오는 중…</option>}
            {schools.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label className="label" htmlFor="idno">
            {idLabel}
          </label>
          <input
            id="idno"
            className="input"
            type="text"
            inputMode={role === 'student' ? 'numeric' : 'text'}
            autoComplete="username"
            placeholder={role === 'student' ? '예: 20231234' : '예: S2024001'}
            value={idNo}
            onChange={(e) => setIdNo(e.target.value)}
          />
        </div>

        <div className="field">
          <label className="label" htmlFor="uname">
            이름
          </label>
          <input
            id="uname"
            className="input"
            type="text"
            autoComplete="name"
            placeholder="예: 홍길동"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <label className="st-check">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          사용자 저장
        </label>

        <button type="submit" className="btn block" disabled={busy} style={{ marginTop: 8 }}>
          {busy ? '확인 중…' : '로그인'}
        </button>

        {error && (
          <p className="st-error" role="alert">
            {error}
          </p>
        )}
      </form>

      <p className="st-footer">
        입력한 정보는 비교과 출석 확인에만 사용됩니다.
        <br />
        로그인은 3시간 후 자동으로 만료됩니다.
      </p>
    </div>
  );
}
