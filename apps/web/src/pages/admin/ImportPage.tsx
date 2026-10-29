// ─────────────────────────────────────────────
// A-05 엑셀 등록. 학생·수강 / 인솔자 / 장소 / 수업 일정을 엑셀로 한 번에 올린다.
//  1) 종류 고르기 (학생·수강은 학교도 골라야 함) → "템플릿 받기"로 양식 내려받기
//  2) 파일 고르고 "미리보기" → POST /api/admin/import/:kind/preview (FormData: file, schoolId)
//     서버가 행별 오류와 앞쪽 몇 줄을 보여 준다. 아직 저장되지 않은 상태.
//  3) 이미 있는 항목 처리 방식(갱신/건너뛰기) 고르고 "확정"
//     → POST /api/admin/import/:jobId/confirm { mode }  (오류가 있으면 확정할 수 없음)
// ─────────────────────────────────────────────
import { useState, type ChangeEvent, type CSSProperties } from 'react';
import { api } from '../../api/client';
import type { AdminSchool, ImportPreview, ImportResult } from '../../api/types';
import { adminError } from '../../components/admin/format';
import { useLoad } from '../../components/admin/hooks';
import { Alert, LoadError, PageHead, Tabs } from '../../components/admin/ui';

type Kind = ImportPreview['kind'];
const KINDS: { value: Kind; label: string }[] = [
  { value: 'students', label: '학생·수강' },
  { value: 'staff', label: '인솔자' },
  { value: 'locations', label: '장소' },
  { value: 'sessions', label: '수업 일정' },
];

export default function ImportPage() {
  const schools = useLoad(() => api.get<AdminSchool[]>('/api/admin/schools'), []);
  const [kind, setKind] = useState<Kind>('students');
  const [schoolId, setSchoolId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0); // 파일 칸을 비울 때 다시 그리기용
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [mode, setMode] = useState<'update' | 'skip'>('update');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  // 종류·학교·파일이 바뀌면 이전 미리보기는 버린다
  function resetPreview() {
    setPreview(null);
    setResult(null);
    setError(null);
  }

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    setFile(e.target.files?.[0] ?? null);
    resetPreview();
  }

  async function runPreview() {
    if (!file) return setError('엑셀 파일을 골라 주세요.');
    if (kind === 'students' && !schoolId) return setError('학생·수강은 학교를 먼저 골라 주세요.');
    setBusy(true);
    resetPreview();
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (kind === 'students') fd.append('schoolId', schoolId);
      setPreview(await api.upload<ImportPreview>(`/api/admin/import/${kind}/preview`, fd));
    } catch (e) {
      setError(adminError(e));
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<ImportResult>(`/api/admin/import/${preview.jobId}/confirm`, { mode });
      setResult(res);
      setPreview(null);
      setFile(null);
      setFileKey((k) => k + 1);
    } catch (e) {
      setError(adminError(e));
    } finally {
      setBusy(false);
    }
  }

  const hasErrors = !!preview && (preview.errors.length > 0 || preview.counts.error > 0);
  const sampleCols = preview?.sample[0] ? Object.keys(preview.sample[0]) : [];

  return (
    <>
      <PageHead title="엑셀 등록" desc="템플릿을 받아 채운 뒤 올리면, 저장하기 전에 미리보기로 오류를 확인할 수 있어요." />
      <Alert kind="info">장소를 먼저 올린 다음 수업 일정을 올려 주세요.</Alert>

      {/* ── 1. 종류·파일 ── */}
      <section className="adm-section" aria-label="파일 올리기">
        <h2>1. 종류와 파일 고르기</h2>
        <Tabs
          value={kind}
          onChange={(v) => {
            setKind(v);
            resetPreview();
          }}
          items={KINDS}
        />
        <div className="adm-row" style={{ alignItems: 'flex-end', gap: 14 }}>
          {kind === 'students' && (
            <div className="field" style={{ marginBottom: 0, minWidth: 200 }}>
              <label className="label" htmlFor="imp-school">학교</label>
              <select
                id="imp-school"
                className="select"
                value={schoolId}
                onChange={(e) => {
                  setSchoolId(e.target.value);
                  resetPreview();
                }}
              >
                <option value="">학교 선택</option>
                {(schools.data ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="field" style={{ marginBottom: 0, flex: '1 1 260px' }}>
            <label className="label" htmlFor="imp-file">엑셀 파일 (.xlsx)</label>
            <input key={fileKey} id="imp-file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={onFile} className="input" style={{ paddingTop: 10 }} />
          </div>
          <a className="btn secondary" href={`/api/admin/import/${kind}/template`} download>
            템플릿 받기
          </a>
          <button type="button" className="btn" onClick={runPreview} disabled={busy || !file}>
            {busy && !preview ? '확인 중…' : '미리보기'}
          </button>
        </div>
        {schools.error && <LoadError message={schools.error} onRetry={schools.reload} />}
        {error && <Alert kind="error">{error}</Alert>}
        {result && (
          <Alert kind="ok">
            등록을 마쳤어요. 새로 추가 {result.created}건 · 갱신 {result.updated}건 · 건너뜀 {result.skipped}건
          </Alert>
        )}
      </section>

      {/* ── 2. 미리보기 ── */}
      {preview && (
        <section className="adm-section" aria-label="미리보기">
          <div className="adm-section-head">
            <h2>2. 미리보기 · {preview.fileName}</h2>
            <span className="desc">아직 저장되지 않았어요</span>
          </div>
          <div className="adm-stats small">
            <div className="adm-stat" style={{ '--accent': '#16A34A' } as CSSProperties}>
              <span className="label">새로 추가</span>
              <span className="value">{preview.counts.create}</span>
            </div>
            <div className="adm-stat" style={{ '--accent': '#1E3A8A' } as CSSProperties}>
              <span className="label">이미 있음 (갱신 대상)</span>
              <span className="value">{preview.counts.update}</span>
            </div>
            <div className="adm-stat" style={{ '--accent': '#64748B' } as CSSProperties}>
              <span className="label">변경 없음</span>
              <span className="value">{preview.counts.skip}</span>
            </div>
            <div className="adm-stat" style={{ '--accent': '#DC2626', '--value': hasErrors ? '#B91C1C' : undefined } as CSSProperties}>
              <span className="label">오류</span>
              <span className="value">{preview.counts.error}</span>
            </div>
          </div>

          {/* 오류 목록 */}
          {preview.errors.length > 0 && (
            <>
              <Alert kind="error">오류가 있는 행을 엑셀에서 고친 뒤 다시 올려 주세요. 오류가 있으면 확정할 수 없어요.</Alert>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th scope="col">시트</th>
                      <th scope="col" className="num">행</th>
                      <th scope="col">열</th>
                      <th scope="col">내용</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.errors.map((er, i) => (
                      <tr key={i}>
                        <td>{er.sheet}</td>
                        <td className="num">{er.row}</td>
                        <td>{er.column}</td>
                        <td style={{ color: 'var(--absent-text)' }}>{er.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* 앞쪽 몇 줄 */}
          {sampleCols.length > 0 && (
            <>
              <h3 style={{ margin: 0, fontSize: 15 }}>앞쪽 {preview.sample.length}줄</h3>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      {sampleCols.map((c) => (
                        <th key={c} scope="col">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.sample.map((row, i) => (
                      <tr key={i}>
                        {sampleCols.map((c) => (
                          <td key={c}>{row[c]}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* 3. 이미 있는 항목 처리 방식 + 확정 */}
          <h2 style={{ marginTop: 6 }}>3. 확정</h2>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <label className="adm-check">
              <input type="radio" name="imp-mode" checked={mode === 'update'} onChange={() => setMode('update')} />
              갱신 — 이미 있는 항목은 엑셀 내용으로 바꿔요
            </label>
            <label className="adm-check">
              <input type="radio" name="imp-mode" checked={mode === 'skip'} onChange={() => setMode('skip')} />
              건너뛰기 — 이미 있는 항목은 그대로 두고 새 항목만 추가해요
            </label>
          </div>
          <div className="adm-row end">
            <button type="button" className="btn secondary" onClick={resetPreview} disabled={busy}>
              취소
            </button>
            <button type="button" className="btn" onClick={confirm} disabled={busy || hasErrors}>
              {busy ? '저장 중…' : '확정'}
            </button>
          </div>
        </section>
      )}
    </>
  );
}
