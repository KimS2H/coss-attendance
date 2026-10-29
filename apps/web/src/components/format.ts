// 화면 표시용 도우미 (시간 형식, 상태 이름).
// 서버 시각은 UTC(ISO 문자열)로 오므로 화면에서는 항상 한국 시간(Asia/Seoul)으로 바꿔 보여 준다.
import type { AttendanceStatus, ChangeRequestStatus, TicketStatus } from '../api/types';

const TZ = 'Asia/Seoul';

/** ISO 시각 → "10:02" (한국 시간) */
export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('ko-KR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
}

/** ISO 시각 → "2026-11-05" (한국 날짜) */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  // en-CA 형식이 "YYYY-MM-DD" 모양이라 이것을 쓴다
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** ISO 시각 → "2026-11-05 10:02" */
export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  return `${fmtDate(iso)} ${fmtTime(iso)}`;
}

/** 오늘 한국 날짜 "YYYY-MM-DD" */
export function todayKst(): string {
  return fmtDate(new Date().toISOString());
}

/** 지금 한국 시각 "HH:MM" (serverTime을 주면 그 시각 기준) */
export function nowKstHHMM(serverTime?: string): string {
  return fmtTime(serverTime ?? new Date().toISOString());
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** "2026-11-05" → "2026.11.05 (목)" */
export function fmtDateLabel(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return ymd;
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${ymd.replaceAll('-', '.')} (${WEEKDAYS[day]})`;
}

/** "10:00"에 분을 더하거나 뺀다 → "09:55" */
export function addMinutes(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  let total = (h * 60 + m + minutes) % (24 * 60);
  if (total < 0) total += 24 * 60;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** 출석 상태 → 화면 이름 */
export const STATUS_LABEL: Record<AttendanceStatus, string> = {
  none: '미출',
  present: '출석',
  late: '지각',
  absent: '결석',
  excused: '공결',
  pending_device: '승인 대기',
  canceled: '출석 취소',
};

/** 문의 상태 → 화면 이름 */
export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  open: '접수',
  in_progress: '처리 중',
  escalated: '관리자 확인 중',
  resolved: '해결됨',
};

/** 문의 상태 → 배지 색(class) */
export const TICKET_STATUS_CLASS: Record<TicketStatus, string> = {
  open: 'late',
  in_progress: 'excused',
  escalated: 'pending_device',
  resolved: 'present',
};

/** 출결 변경 신청 상태 → 화면 이름 */
export const CHANGE_STATUS_LABEL: Record<ChangeRequestStatus, string> = {
  pending: '대기',
  auto_rejected: '우선 거절 · 총관리자 재검토 대기',
  approved: '승인',
  rejected: '거절',
};

export const CHANGE_STATUS_CLASS: Record<ChangeRequestStatus, string> = {
  pending: 'late',
  auto_rejected: 'pending_device',
  approved: 'present',
  rejected: 'absent',
};
