// ─────────────────────────────────────────────
// 첫 설정 상태 묻기 (GET /api/admin/setup/status).
// 설정이 끝난 뒤 서버가 setup API 에 409 를 돌려주는 경우도 "설정 완료"로 본다
// (docs/api.md: 첫 설정 완료 후 setup API 는 모두 409).
// AdminLayout·SetupPage·LoginPage 에서 같이 쓴다.
// ─────────────────────────────────────────────
import { api, ApiRequestError } from '../../api/client';
import type { SetupStatus } from '../../api/types';

export async function getSetupStatus(): Promise<SetupStatus> {
  try {
    return await api.get<SetupStatus>('/api/admin/setup/status');
  } catch (e) {
    if (e instanceof ApiRequestError && e.status === 409 && e.code !== 'SETUP_REQUIRED') return { completed: true, step: 'done' };
    throw e;
  }
}
