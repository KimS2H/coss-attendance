// ─────────────────────────────────────────────
// A-12 설정 (ADM-17): 이메일(SMTP) 설정 변경.
//  GET /api/admin/settings/smtp → 저장된 값 (비밀번호는 오지 않고 passwordSet 만 옴)
//  PUT /api/admin/settings/smtp → 테스트 메일 보낸 뒤 저장. 비밀번호를 비우면 기존 값 유지.
// ─────────────────────────────────────────────
import { api } from '../../api/client';
import type { SmtpInput, SmtpSettings } from '../../api/types';
import SmtpForm from '../../components/admin/SmtpForm';
import { useLoad } from '../../components/admin/hooks';
import { LoadError, PageHead } from '../../components/admin/ui';

export default function SettingsPage() {
  const { data, error, reload, setData } = useLoad(() => api.get<SmtpSettings>('/api/admin/settings/smtp'), []);

  return (
    <>
      <PageHead title="설정" desc="알림 메일(출결 변경, 기기 승인, 문의, 장애 알림)을 보내는 이메일 계정이에요." />
      {error && <LoadError message={error} onRetry={reload} />}
      {data && (
        <section className="adm-section" style={{ maxWidth: 640 }} aria-label="이메일 설정">
          <h2>이메일(SMTP)</h2>
          <SmtpForm
            initial={data}
            onSubmit={async (input: SmtpInput) => {
              const saved = await api.put<SmtpSettings>('/api/admin/settings/smtp', input);
              setData(saved);
              return `테스트 메일을 ${input.testTo}(으)로 보냈고 설정을 저장했어요.`;
            }}
          />
        </section>
      )}
      {!data && !error && <p className="adm-empty">불러오는 중…</p>}
    </>
  );
}
