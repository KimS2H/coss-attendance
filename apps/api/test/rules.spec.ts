// 출석 판정 규칙 테스트 (DB 없이)
process.env.APP_SECRET = process.env.APP_SECRET || 'test-secret-test-secret-test-secret-1234';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://x';

import { classifyTime, roomCodeAt, sessionWindow, statusAtApproval, verifyRoomCode, withinRange } from '../src/attendance/rules';

describe('출석 시간 판정 (시작 5분 전 ~ 5분 후 출석, 종료까지 지각)', () => {
  const w = sessionWindow('2026-11-05', '10:00', '11:50');
  const at = (hhmmss: string) => new Date(`2026-11-05T${hhmmss}+09:00`);
  it.each([
    ['09:54:59', 'too_early'],
    ['09:55:00', 'present'],
    ['10:04:59', 'present'],
    ['10:05:00', 'late'],
    ['11:49:59', 'late'],
    ['11:50:00', 'closed'],
  ])('%s → %s', (t, expected) => expect(classifyTime(at(t), w)).toBe(expected));

  it('기기 승인 시각 기준: 끝난 뒤 승인이면 결석', () => {
    expect(statusAtApproval(at('10:03:00'), w)).toBe('present');
    expect(statusAtApproval(at('10:30:00'), w)).toBe('late');
    expect(statusAtApproval(at('12:00:00'), w)).toBe('absent');
  });
});

describe('거리 판정 (거리 − min(정확도, 50m) ≤ 반경)', () => {
  it('반경 안', () => expect(withinRange(40, 10, 50)).toBe(true));
  it('정확도만큼 봐줌', () => expect(withinRange(80, 35, 50)).toBe(true));
  it('정확도 보정은 최대 50m', () => expect(withinRange(120, 500, 50)).toBe(false));
  it('반경 밖', () => expect(withinRange(350, 18, 50)).toBe(false));
});

describe('강의실 코드 (30초마다 변경)', () => {
  const t0 = Date.UTC(2026, 10, 5, 1, 0, 0); // 30초 구간의 시작
  it('4자리 숫자', () => expect(roomCodeAt(7, t0).code).toMatch(/^\d{4}$/));
  it('남은 시간', () => expect(roomCodeAt(7, t0 + 12_000).secondsLeft).toBe(18));
  it('지금 코드 통과', () => expect(verifyRoomCode(7, roomCodeAt(7, t0).code, t0 + 5_000)).toBe(true));
  it('바로 전 코드도 통과 (입력 중에 바뀐 경우)', () => expect(verifyRoomCode(7, roomCodeAt(7, t0).code, t0 + 35_000)).toBe(true));
  it('두 구간 전 코드는 실패', () => {
    const old = roomCodeAt(7, t0).code;
    const later = t0 + 65_000;
    if (old !== roomCodeAt(7, later).code && old !== roomCodeAt(7, later - 30_000).code) expect(verifyRoomCode(7, old, later)).toBe(false);
  });
  it('다른 수업 코드와 다름 (대부분)', () => {
    const codes = new Set(Array.from({ length: 20 }, (_, i) => roomCodeAt(i + 1, t0).code));
    expect(codes.size).toBeGreaterThan(15);
  });
});
