// 시간 도우미. 서버 시각만 쓰고, 한국 시간(KST, UTC+9, 서머타임 없음)으로 계산한다.
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 지금 한국 날짜 "YYYY-MM-DD" */
export function kstToday(now = new Date()): string {
  return new Date(now.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** 한국 날짜 + "HH:MM" → 실제 시각(Date) */
export function kstInstant(date: string, hhmm: string): Date {
  return new Date(`${date}T${hhmm}:00+09:00`);
}

/** Date → 한국 시각 "HH:MM" */
export function kstHHMM(d: Date): string {
  return new Date(d.getTime() + KST_OFFSET_MS).toISOString().slice(11, 16);
}

/** DB의 date 칸(UTC 자정으로 읽힘) → "YYYY-MM-DD" */
export function dateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" → DB date 칸에 넣을 값 */
export function toDbDate(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

export function addMinutes(d: Date, min: number): Date {
  return new Date(d.getTime() + min * 60_000);
}

/** "HH:MM"에 분을 더한 "HH:MM" (화면 표시용) */
export function shiftHHMM(hhmm: string, min: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const total = (h * 60 + m + min + 24 * 60) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export const isDateStr = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
export const isHHMM = (s: unknown): s is string => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
