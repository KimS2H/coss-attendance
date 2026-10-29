// ─────────────────────────────────────────────
// 총관리자 화면에서 쓰는 글자 바꾸기 도우미.
//  - 서버 시각(ISO, UTC)을 한국 시간(24시간제)으로 보여 준다.
//  - 상태 코드(present 등)를 한국어 이름으로 바꾼다.
// ─────────────────────────────────────────────
import { ApiRequestError, errorMessage } from '../../api/client';
import type { AttendanceStatus, ChangeRequestStatus, TicketStatus } from '../../api/types';

const KST = 'Asia/Seoul';
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** 시각을 한국 시간 기준 조각(년·월·일·시·분·초)으로 나눈다 */
function kstParts(d: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: KST,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return { y: get('year'), m: get('month'), d: get('day'), hh: get('hour'), mm: get('minute'), ss: get('second') };
}

/** 오늘 날짜(한국) "YYYY-MM-DD" */
export function todayKST(): string {
  const p = kstParts(new Date());
  return `${p.y}-${p.m}-${p.d}`;
}

/** "YYYY-MM-DD" 에 n일을 더한 날짜 */
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" → "2026.11.05 (목)" */
export function fmtDateLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) return date;
  const wd = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${y}.${String(m).padStart(2, '0')}.${String(d).padStart(2, '0')} (${wd})`;
}

/** ISO 시각 → "10:45" (한국 시간). 값이 없으면 "-" */
export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '-';
  const p = kstParts(new Date(iso));
  return `${p.hh}:${p.mm}`;
}

/** ISO 시각 → "2026-11-05 10:45" (한국 시간). 값이 없으면 "-" */
export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '-';
  const p = kstParts(new Date(iso));
  return `${p.y}-${p.m}-${p.d} ${p.hh}:${p.mm}`;
}

/** 지금 시각 → "2026.11.05 (목) 10:45" */
export function fmtNowLabel(d: Date): string {
  const p = kstParts(d);
  return `${fmtDateLabel(`${p.y}-${p.m}-${p.d}`)} ${p.hh}:${p.mm}`;
}

/** 남은 밀리초 → "mm:ss" */
export function fmtRemaining(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** 출석 상태 한국어 이름 */
export const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: '출석',
  late: '지각',
  absent: '결석',
  excused: '공결',
  none: '미출',
  pending_device: '승인 대기',
  canceled: '출석 취소',
};

/** 문의 상태 한국어 이름 */
export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  open: '접수',
  in_progress: '처리 중',
  escalated: '관리자 이관',
  resolved: '해결',
};

/** 출결 변경 신청 상태 한국어 이름 */
export const CR_STATUS_LABEL: Record<ChangeRequestStatus, string> = {
  pending: '승인 대기',
  approved: '승인',
  rejected: '거절',
  auto_rejected: '우선 거절',
};

/** 인솔자 권한 한국어 이름 */
export const PERMISSION_LABEL = { view: '보기', edit: '수정' } as const;

/**
 * 오류를 화면용 문장으로. 서버가 칸별 오류(fields)를 주면 뒤에 붙인다.
 * 예) "입력값을 확인해 주세요. (아이디: 이미 있어요)"
 */
export function adminError(e: unknown): string {
  const base = errorMessage(e);
  if (e instanceof ApiRequestError && e.fields) {
    const extra = Object.values(e.fields).filter(Boolean).join(', ');
    if (extra) return `${base} (${extra})`;
  }
  return base;
}
