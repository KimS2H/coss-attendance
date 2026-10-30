// API 호출 도우미. 모든 화면은 이 함수들로 서버와 통신한다.
// 로그인 정보는 서버가 준 쿠키(sid_s·sid_t·sid_a)로 자동 전송되므로 화면에서 따로 저장하지 않는다.
import type { ApiError } from './types';

export class ApiRequestError extends Error {
  status: number;
  code: string;
  fields?: Record<string, string>;
  constructor(status: number, err: ApiError) {
    super(err.message);
    this.status = status;
    this.code = err.code;
    this.fields = err.fields;
  }
}

/**
 * 지금 화면이 어느 구역인지 (서버가 그 구역의 로그인 쿠키를 읽는다).
 * 한 컴퓨터에서 관리자·인솔자·학생 화면을 같이 열어도 로그인이 섞이지 않게 한다.
 */
function currentArea(): 'student' | 'staff' | 'admin' {
  const p = window.location.pathname;
  if (p === '/admin' || p.startsWith('/admin/')) return 'admin';
  if (p === '/staff' || p.startsWith('/staff/')) return 'staff';
  return 'student';
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const isForm = body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: { 'X-Coss-Area': currentArea(), ...(body === undefined || isForm ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
  } catch {
    throw new ApiRequestError(0, { code: 'NETWORK', message: '인터넷 연결을 확인해 주세요.' });
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err: ApiError = data?.error ?? { code: 'UNKNOWN', message: '잠시 후 다시 시도해 주세요.' };
    // 세션 만료(3시간): 로그인 화면으로
    if (res.status === 401 && err.code === 'UNAUTHORIZED') window.dispatchEvent(new Event('coss:unauthorized'));
    throw new ApiRequestError(res.status, err);
  }
  return data as T;
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body?: unknown) => request<T>('POST', url, body ?? {}),
  put: <T>(url: string, body?: unknown) => request<T>('PUT', url, body ?? {}),
  patch: <T>(url: string, body?: unknown) => request<T>('PATCH', url, body ?? {}),
  del: <T>(url: string) => request<T>('DELETE', url),
  upload: <T>(url: string, form: FormData) => request<T>('POST', url, form),
};

/** 오류를 화면에 보여 줄 문장으로 바꾼다 */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiRequestError) return e.message;
  return '알 수 없는 오류가 났어요. 잠시 후 다시 시도해 주세요.';
}
