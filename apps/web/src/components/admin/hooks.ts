// ─────────────────────────────────────────────
// 총관리자 화면에서 쓰는 React 도우미(hook).
//  - useLoad: 서버에서 데이터를 불러오고, 로딩·오류 상태를 관리
//  - useNow: 1초마다 현재 시각을 갱신 (남은 시간 표시용)
//  - useInterval: 일정 간격으로 함수 실행 (자동 새로고침용)
//  - useDebounced: 입력이 멈춘 뒤에 값 반영 (검색창용)
// ─────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from 'react';
import { adminError } from './format';

/**
 * 데이터 불러오기.
 * load: 데이터를 가져오는 함수, deps: 이 값들이 바뀌면 다시 불러온다.
 * 돌려주는 값: data(결과), error(오류 문장), loading(불러오는 중), reload(다시 불러오기)
 */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // 요청 번호: 늦게 도착한 옛 응답이 새 응답을 덮어쓰지 않게 한다
  const seq = useRef(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  const reload = useCallback(async () => {
    const my = ++seq.current;
    setLoading(true);
    try {
      const result = await loadRef.current();
      if (my === seq.current) {
        setData(result);
        setError(null);
      }
    } catch (e) {
      if (my === seq.current) setError(adminError(e));
    } finally {
      if (my === seq.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, error, loading, reload, setData };
}

/** 현재 시각(밀리초)을 intervalMs 마다 갱신 */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(t);
  }, [intervalMs]);
  return now;
}

/** fn 을 ms 마다 실행 (화면을 떠나면 멈춤) */
export function useInterval(fn: () => void, ms: number) {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    const t = window.setInterval(() => fnRef.current(), ms);
    return () => window.clearInterval(t);
  }, [ms]);
}

/** value 가 ms 동안 바뀌지 않으면 그 값을 돌려준다 */
export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}
