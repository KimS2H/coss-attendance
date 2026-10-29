// 여러 화면에서 같이 쓰는 React 도우미(hook).
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * 일정 간격(ms)마다 fn을 실행한다. 화면을 떠나면 자동으로 멈춘다.
 * ms가 null이면 멈춘 상태.
 */
export function useInterval(fn: () => void, ms: number | null) {
  const saved = useRef(fn);
  // 항상 가장 최근 fn을 부르도록 저장해 둔다
  useEffect(() => {
    saved.current = fn;
  }, [fn]);
  useEffect(() => {
    if (ms === null) return;
    const id = window.setInterval(() => saved.current(), ms);
    return () => window.clearInterval(id);
  }, [ms]);
}

/**
 * 로그인이 만료되면(서버가 401을 주면) api/client.ts가 'coss:unauthorized' 이벤트를 보낸다.
 * 이 hook을 쓴 화면은 그 이벤트를 받으면 로그인 화면으로 이동한다.
 */
export function useUnauthorizedRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    const onUnauthorized = () => navigate('/login', { replace: true });
    window.addEventListener('coss:unauthorized', onUnauthorized);
    return () => window.removeEventListener('coss:unauthorized', onUnauthorized);
  }, [navigate]);
}

/** localStorage 읽기 (사생활 보호 모드 등에서 오류가 날 수 있어 try/catch로 감싼다) */
export function storageGet<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** localStorage 저장. value가 null이면 지운다 */
export function storageSet(key: string, value: unknown) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 저장이 안 되는 환경이면 조용히 넘어간다 (다음에 다시 입력하면 됨)
  }
}
