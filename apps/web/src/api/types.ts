// ─────────────────────────────────────────────
// API 응답·요청 모양 (docs/api.md와 같은 내용).
// 화면과 API 서버가 이 모양을 함께 지킨다. 바꿀 때는 apps/api 쪽도 같이 바꾼다.
// 시각(…At)은 ISO 문자열(UTC). 날짜는 "YYYY-MM-DD", 시각(…Time)은 "HH:MM" 한국 시각.
// ─────────────────────────────────────────────

export type ApiError = { code: string; message: string; fields?: Record<string, string> };

export type AttendanceStatus = 'none' | 'present' | 'late' | 'absent' | 'excused' | 'pending_device' | 'canceled';

export type School = { id: number; name: string };

// ---------- 로그인 ----------
export type StudentInfo = {
  id: number;
  schoolName: string;
  college: string;
  department: string;
  studentNo: string;
  name: string;
};
export type StudentMe = {
  role: 'student';
  student: StudentInfo;
  needsConsent: boolean;
  device: 'registered' | 'newly_registered' | 'unregistered';
};
export type StaffInfo = { id: number; schoolId: number; schoolName: string; name: string; permission: 'view' | 'edit' };
export type StaffMe = { role: 'staff'; staff: StaffInfo };
export type AdminMe = { role: 'admin'; admin: { id: number; username: string } };
export type Me = StudentMe | StaffMe | AdminMe;

// ---------- 학생 ----------
export type TodaySession = {
  id: number;
  period: number;
  courseName: string;
  locationName: string;
  startTime: string;
  endTime: string;
  attendFrom: string; // 출석 시작 (시작 5분 전)
  lateFrom: string; // 이 시각부터 지각 (시작 5분 후)
  status: AttendanceStatus;
  checkedAt: string | null;
  suspicious: boolean;
};
export type Today = { serverTime: string; date: string; currentSessionId: number | null; sessions: TodaySession[] };

export type AttendResult =
  | 'present'
  | 'late'
  | 'pending_device'
  | 'proxy_canceled'
  | 'too_early'
  | 'closed'
  | 'out_of_range'
  | 'gps_denied'
  | 'code_wrong'
  | 'already'
  | 'not_enrolled';
export type AttendRequest = {
  sessionId: number;
  code: string;
  location: { lat: number; lng: number; accuracy: number } | null;
};
export type AttendResponse = {
  result: AttendResult;
  status: AttendanceStatus; // 요청 후 이 수업의 상태
  decidedAt: string | null;
  distanceM: number | null;
  radiusM: number;
  attendFrom: string;
  message: string; // 화면에 보여 줄 한국어 안내
};

export const STUDENT_TICKET_CATEGORIES = ['출석 불가', '위치 인식 불가', '코드 입력 불가', '로그인 불가', '기기 변경·분실', '수업 정보 오류', '기타'] as const;
export const STAFF_TICKET_CATEGORIES = ['정보 변경 불가', '학생 인식 불가', '엑셀 등록 오류', '강의실 코드 표시 오류', '출석 현황·다운로드 오류', '로그인·학교 코드 문제', '알림·이메일 미수신', '기타'] as const;

export type TicketStatus = 'open' | 'in_progress' | 'escalated' | 'resolved';
export type TicketMessage = { id: number; authorType: 'student' | 'staff' | 'admin'; authorName: string; body: string; createdAt: string };
export type Ticket = {
  id: number;
  schoolName: string;
  reporterType: 'student' | 'staff';
  reporterName: string; // 학생: "홍길동(20231234)", 인솔자: "김담당"
  studentId: number | null; // 학생 문의면 학생 ID (출결 변경 신청에 씀)
  category: string;
  content: string;
  sessionLabel: string | null; // "1교시 AI 기초 (11-05)"
  sessionId: number | null;
  status: TicketStatus;
  assignee: 'staff' | 'admin';
  diagnostics: Record<string, unknown> | null;
  createdAt: string;
  messages: TicketMessage[];
};
export type NewTicket = { category: string; sessionId: number | null; content: string; diagnostics?: Record<string, unknown> };

// ---------- 인솔자 ----------
export type StaffSession = {
  id: number;
  date: string;
  period: number;
  courseName: string;
  locationName: string;
  startTime: string;
  endTime: string;
  enrolled: number; // 담당 학교 수강생 수
  attended: number; // 출석+지각
};
export type RoomCode = { code: string; secondsLeft: number; attended: number; enrolled: number; session: StaffSession };

export type AttendanceRow = {
  attendanceId: number | null; // 미출이면 null
  studentId: number;
  studentNo: string;
  name: string;
  schoolName: string;
  department: string;
  sessionId: number;
  date: string;
  period: number;
  courseName: string;
  status: AttendanceStatus;
  checkedAt: string | null;
  decidedAt: string | null;
  distanceM: number | null;
  locationText: string; // "반경 내 (35m)" / "반경 밖 (120m)" / "-"
  suspicious: boolean;
  suspiciousReason: string | null;
  pendingChangeRequest: boolean;
};
export type AttendanceSummary = { total: number; present: number; late: number; absent: number; none: number; pending: number; suspicious: number };
export type AttendanceList = { rows: AttendanceRow[]; summary: AttendanceSummary };

export type DeviceApproval = {
  id: number;
  status: 'pending' | 'approved' | 'rejected';
  studentId: number;
  studentName: string;
  studentNo: string;
  schoolName: string;
  sessionLabel: string;
  requestedAt: string;
  userAgent: string | null;
  distanceM: number | null;
  ownerName: string | null; // 이 기기가 다른 학생의 등록 기기이면 그 학생 이름
  decidedAt: string | null;
  decidedByName: string | null;
  rejectReason: string | null;
};
export type DeviceDecision = { status: AttendanceStatus; message: string }; // 승인 결과: 승인 시각 기준 출석/지각/결석

export type StudentRow = {
  id: number;
  schoolId: number;
  schoolName: string;
  studentNo: string;
  name: string;
  college: string;
  department: string;
  isActive: boolean;
  deviceStatus: 'registered' | 'none';
  enrolledSessions: number;
};
export type StudentInput = { studentNo: string; name: string; college: string; department: string; isActive?: boolean };

export type ChangeRequestStatus = 'pending' | 'approved' | 'rejected' | 'auto_rejected';
export type ChangeRequest = {
  id: number;
  status: ChangeRequestStatus;
  schoolName: string;
  studentName: string;
  studentNo: string;
  sessionLabel: string;
  fromStatus: AttendanceStatus;
  toStatus: 'present' | 'late' | 'absent' | 'excused';
  reason: string;
  requestedByName: string;
  ticketId: number | null;
  createdAt: string;
  deadlineAt: string; // 신청 + 10분. 지나면 우선 거절
  autoRejectedAt: string | null;
  decidedAt: string | null;
  decidedByName: string | null;
  rejectReason: string | null;
};
export type NewChangeRequest = { studentId: number; sessionId: number; toStatus: 'present' | 'late' | 'absent' | 'excused'; reason: string; ticketId?: number | null };

// 엑셀 일괄 등록 (미리보기 → 확정)
export type ImportRowError = { sheet: string; row: number; column: string; message: string };
export type ImportPreview = {
  jobId: number;
  kind: 'students' | 'staff' | 'locations' | 'sessions';
  fileName: string;
  counts: { create: number; update: number; skip: number; error: number };
  errors: ImportRowError[];
  sample: Record<string, string>[]; // 앞쪽 몇 줄 미리보기
};
export type ImportResult = { created: number; updated: number; skipped: number };

// ---------- 총관리자 ----------
export type SetupStatus = { completed: boolean; step: 'account' | 'smtp' | 'done' };
export type SmtpInput = { host: string; port: number; secure: boolean; user: string; password: string; fromName: string; testTo: string };
export type SmtpSettings = { host: string; port: number; secure: boolean; user: string; fromName: string; passwordSet: boolean };

export type AdminSchool = { id: number; name: string; codeSet: boolean; codeChangedAt: string | null; studentCount: number; staffCount: number };
export type AdminStaff = { id: number; schoolId: number; schoolName: string; staffNo: string; name: string; email: string; permission: 'view' | 'edit'; isActive: boolean };
export type StaffInput = { schoolId: number; staffNo: string; name: string; email: string; permission: 'view' | 'edit'; isActive?: boolean };
export type AdminLocation = { id: number; name: string; latitude: number; longitude: number; radiusM: number };
export type LocationInput = { name: string; latitude: number; longitude: number; radiusM: number };
export type AdminSession = { id: number; date: string; period: number; courseName: string; locationId: number; locationName: string; startTime: string; endTime: string; enrolled: number };
export type SessionInput = { courseName: string; date: string; period: number; startTime: string; endTime: string; locationId: number };

export type Dashboard = {
  date: string;
  attendanceRate: { percent: number; attended: number; total: number }; // 지각 포함
  pendingChangeRequests: ChangeRequest[];
  reviewChangeRequests: ChangeRequest[]; // 우선 거절된 신청 (재검토 대기)
  adminTickets: Ticket[]; // 총관리자가 처리할 문의 (이관·인솔자 문의)
  staffOpenTickets: number; // 인솔자가 처리 중인 문의 수
  pendingDeviceApprovals: number;
  suspiciousToday: number;
  proxyCanceledToday: number;
  system: { status: 'ok' | 'warning' | 'critical'; message: string };
  schools: { schoolId: number; schoolName: string; percent: number; none: number; suspicious: number; openTickets: number }[];
};
