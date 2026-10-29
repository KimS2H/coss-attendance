// L-07 엑셀 일괄 등록 (학생·수강).
// 1) 템플릿 받기 → 2) 채운 엑셀 파일 올리기 → 3) 미리보기(행별 오류 확인) → 4) 확정
// 오류가 하나라도 있으면 확정할 수 없다. 엑셀을 고쳐서 다시 올리면 된다.
import { useRef, useState } from 'react';
import { api, errorMessage } from '../../api/client';
import type { ImportPreview, ImportResult } from '../../api/types';
import { IconDownload } from '../../components/Icons';
import { useStaff } from './context';

type Mode = 'update' | 'skip';

export default function ImportPage() {
  const { canEdit } = useStaff();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [mode, setMode] = useState<Mode>('update');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // 2) 파일 올리고 미리보기 받기
  async function upload() {
    if (!file) return setError('엑셀 파일(.xlsx)을 고르세요.');
    setError('');
    setPreview(null);
    setResult(null);
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      setPreview(await api.upload<ImportPreview>('/api/staff/import/preview', form));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  // 4) 확정
  async function confirm() {
    if (!preview) return;
    setError('');
    setBusy(true);
    try {
      setResult(await api.post<ImportResult>(`/api/staff/import/${preview.jobId}/confirm`, { mode }));
      setPreview(null);
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const sampleCols = preview?.sample[0] ? Object.keys(preview.sample[0]) : [];

  return (
    <>
      <div>
        <h1 className="sf-title">엑셀 등록</h1>
        <p className="sf-sub">학생과 수강 정보를 엑셀로 한 번에 등록해요. 올리기 전에 미리보기로 오류를 확인할 수 있어요.</p>
      </div>

      {!canEdit && <p className="sf-alert">보기 권한이라 엑셀 등록을 할 수 없어요.</p>}

      {/* 1단계: 템플릿 */}
      <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h2 style={stepTitle}>1. 템플릿 받기</h2>
        <p className="sf-sub" style={{ margin: 0 }}>
          정해진 양식에 맞춰 채워야 해요. 첫 줄(제목 줄)은 지우지 마세요.
        </p>
        <a className="sf-small-btn primary" href="/api/staff/import/template" style={{ alignSelf: 'flex-start' }}>
          <IconDownload size={16} />
          템플릿 받기 (.xlsx)
        </a>
      </section>

      {/* 2단계: 파일 올리기 */}
      {canEdit && (
        <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h2 style={stepTitle}>2. 파일 올리기</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setPreview(null);
                setResult(null);
              }}
            />
            <button type="button" className="btn" disabled={!file || busy} onClick={() => void upload()}>
              {busy && !preview ? '확인 중…' : '미리보기'}
            </button>
          </div>
        </section>
      )}

      {error && <p className="sf-alert">{error}</p>}

      {/* 결과 */}
      {result && (
        <p className="sf-ok">
          등록을 마쳤어요. 새로 추가 {result.created}건 · 갱신 {result.updated}건 · 건너뜀 {result.skipped}건
        </p>
      )}

      {/* 3단계: 미리보기 */}
      {preview && (
        <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h2 style={stepTitle}>3. 미리보기 · {preview.fileName}</h2>
          <div className="sf-summary">
            <Count label="새로 추가" value={preview.counts.create} color="var(--present)" />
            <Count label="갱신" value={preview.counts.update} color="var(--navy)" />
            <Count label="건너뜀" value={preview.counts.skip} color="#64748b" />
            <Count label="오류" value={preview.counts.error} color="var(--absent)" />
          </div>

          {preview.errors.length > 0 && (
            <>
              <p className="sf-alert">오류가 있는 행을 엑셀에서 고친 뒤 다시 올려 주세요. 오류가 있으면 확정할 수 없어요.</p>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th scope="col">시트</th>
                      <th scope="col">행</th>
                      <th scope="col">열</th>
                      <th scope="col">내용</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.errors.map((er, i) => (
                      <tr key={i}>
                        <td>{er.sheet}</td>
                        <td>{er.row}</td>
                        <td>{er.column}</td>
                        <td style={{ color: 'var(--absent-text)' }}>{er.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {preview.sample.length > 0 && (
            <>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-2)' }}>앞쪽 몇 줄 미리보기</p>
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

          {/* 4단계: 확정 */}
          <h2 style={stepTitle}>4. 확정</h2>
          <fieldset style={{ border: 0, margin: 0, padding: 0, display: 'flex', flexWrap: 'wrap', gap: '6px 20px' }}>
            <legend style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-2)', marginBottom: 6, padding: 0 }}>이미 있는 학생</legend>
            <label style={radioLabel}>
              <input type="radio" name="mode" checked={mode === 'update'} onChange={() => setMode('update')} />
              갱신 (엑셀 내용으로 바꿈)
            </label>
            <label style={radioLabel}>
              <input type="radio" name="mode" checked={mode === 'skip'} onChange={() => setMode('skip')} />
              건너뛰기 (그대로 둠)
            </label>
          </fieldset>
          <button
            type="button"
            className="btn"
            style={{ alignSelf: 'flex-start' }}
            disabled={busy || preview.counts.error > 0 || preview.errors.length > 0}
            onClick={() => void confirm()}
          >
            {busy ? '등록 중…' : '확정'}
          </button>
        </section>
      )}
    </>
  );
}

function Count({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="sf-stat" style={{ borderTop: `4px solid ${color}` }}>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

const stepTitle: React.CSSProperties = { margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--navy-dark)' };
const radioLabel: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, fontSize: 15 };
