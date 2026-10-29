// ─────────────────────────────────────────────
// 출석 판정 규칙 (DB와 상관없는 순수 계산). 테스트: test/rules.spec.ts
// 규칙을 바꿀 때는 이 파일의 숫자만 바꾸면 된다.
// ─────────────────────────────────────────────
import { createHmac } from 'node:crypto';
import { config } from '../config';
import { addMinutes, kstInstant } from '../common/time';

/** 수업 시작 몇 분 전부터 출석할 수 있나 */
export const OPEN_BEFORE_MIN = 5;
/** 수업 시작 몇 분 후까지 "출석"인가 (그 뒤 종료까지 "지각") */
export const ON_TIME_AFTER_MIN = 5;
/** GPS 오차 보정: 정확도 값을 최대 몇 m까지 빼 줄까 (실내 오차 대비) */
export const GPS_ALLOWANCE_MAX_M = 50;
/** 강의실 코드가 바뀌는 간격(초) */
export const CODE_PERIOD_SEC = 30;

export type SessionWindow = { attendFrom: Date; lateFrom: Date; end: Date };

export function sessionWindow(date: string, startTime: string, endTime: string): SessionWindow {
  const start = kstInstant(date, startTime);
  return {
    attendFrom: addMinutes(start, -OPEN_BEFORE_MIN),
    lateFrom: addMinutes(start, ON_TIME_AFTER_MIN),
    end: kstInstant(date, endTime),
  };
}

/** ① 시간 판정: 아직 이름 / 출석 / 지각 / 끝남 */
export function classifyTime(at: Date, w: SessionWindow): 'too_early' | 'present' | 'late' | 'closed' {
  const t = at.getTime();
  if (t < w.attendFrom.getTime()) return 'too_early';
  if (t < w.lateFrom.getTime()) return 'present';
  if (t < w.end.getTime()) return 'late';
  return 'closed';
}

/** 두 좌표 사이 거리(m) */
export function distanceM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** ② 거리 판정: 거리 − min(정확도, 50m) ≤ 허용 반경 */
export function withinRange(distance: number, accuracy: number, radius: number): boolean {
  const allowance = Math.min(Math.max(accuracy, 0), GPS_ALLOWANCE_MAX_M);
  return distance - allowance <= radius;
}

/**
 * ③ 강의실 코드: 수업 ID와 30초 구간으로 계산한 4자리 숫자.
 * 서버만 아는 APP_SECRET을 섞으므로 학생은 미리 알 수 없다. 따로 저장할 필요가 없다.
 */
export function roomCodeAt(sessionId: number, atMs = Date.now()): { code: string; secondsLeft: number } {
  const slot = Math.floor(atMs / 1000 / CODE_PERIOD_SEC);
  const secondsLeft = CODE_PERIOD_SEC - (Math.floor(atMs / 1000) % CODE_PERIOD_SEC);
  return { code: codeForSlot(sessionId, slot), secondsLeft };
}

function codeForSlot(sessionId: number, slot: number): string {
  const h = createHmac('sha256', config().APP_SECRET).update(`room-code:${sessionId}:${slot}`).digest();
  return String(h.readUInt32BE(0) % 10000).padStart(4, '0');
}

/** 입력한 코드가 지금 코드이거나 바로 전 코드(입력 중에 바뀐 경우)면 통과 */
export function verifyRoomCode(sessionId: number, code: string, atMs = Date.now()): boolean {
  if (!/^\d{4}$/.test(code)) return false;
  const slot = Math.floor(atMs / 1000 / CODE_PERIOD_SEC);
  return code === codeForSlot(sessionId, slot) || code === codeForSlot(sessionId, slot - 1);
}

/** 기기 승인 시각으로 정하는 상태: 출석 / 지각 / (끝난 뒤면) 결석 */
export function statusAtApproval(at: Date, w: SessionWindow): 'present' | 'late' | 'absent' {
  const c = classifyTime(at, w);
  if (c === 'closed') return 'absent';
  if (c === 'late') return 'late';
  return 'present';
}

/** 학생 화면에 보여 줄 판정 결과 안내 */
export const RESULT_MESSAGES: Record<string, string> = {
  present: '출석이 확인되었어요.',
  late: '지각으로 처리되었어요.',
  pending_device: '등록되지 않은 기기예요. 담당자가 승인하면 승인한 시각을 기준으로 출석 또는 지각이 정해져요.',
  proxy_canceled: '같은 기기로 다른 계정이 출석해서 출석이 취소되었어요.',
  too_early: '아직 출석 시간이 아니에요. 수업 시작 5분 전부터 출석할 수 있어요.',
  closed: '수업이 끝나 출석할 수 없어요.',
  out_of_range: '출석 장소에서 멀어요. 강의실 안에서 다시 시도해 주세요.',
  gps_denied: '위치를 확인할 수 없어요. 위치 권한을 켜고 다시 시도해 주세요.',
  code_wrong: '강의실 코드가 맞지 않아요. 화면의 숫자 4자리를 다시 확인해 주세요.',
  already: '이미 처리된 출석이에요.',
  not_enrolled: '이 수업의 수강 정보가 없어요. 담당자에게 문의해 주세요.',
};

export const STATUS_LABEL: Record<string, string> = {
  none: '미출',
  present: '출석',
  late: '지각',
  absent: '결석',
  excused: '공결',
  pending_device: '승인 대기',
  canceled: '출석 취소',
};
