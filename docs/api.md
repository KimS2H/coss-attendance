# API 명세

- 관련 문서: [erd.md](erd.md) · [attendance-flow.md](attendance-flow.md) · [architecture.md](architecture.md) · [요구사항_화면설계.xlsx](요구사항_화면설계.xlsx)
- 구현: `apps/api` (NestJS). 화면과 주고받는 모양은 맨 아래 "대응표"와 `apps/web/src/api/types.ts`가 기준이다.
- 표시: ✅ 구현·테스트 완료 · 🟡 API만 있고 화면은 아직 · ⏳ 운영 시작 후 첫 주 (2026-10-29 기준)

## 공통 규칙

| 항목 | 규칙 |
|---|---|
| 주소 | 모든 API는 `/api`로 시작한다. 총관리자 API는 `/api/admin`으로 시작하고, Nginx가 공개 포트에서는 막는다 |
| 형식 | 요청·응답 모두 JSON (엑셀 업로드·다운로드 제외) |
| 시각 | 서버 시각 기준. 응답은 ISO 8601(UTC, 예: `2026-11-05T01:02:15.000Z`), 화면에서 한국 시간으로 표시 |
| 날짜 | 수업 날짜는 `YYYY-MM-DD` (한국 날짜) |
| 로그인 | 로그인하면 서버가 `sid` 쿠키(HttpOnly, SameSite=Strict, HTTPS에서만)를 준다. 세션은 Redis에 3시간 저장되고 연장하지 않는다 |
| 기기 식별 | 처음 접속한 브라우저에 서버가 `did` 쿠키(HttpOnly, 400일)를 준다. DB에는 이 값의 해시만 저장한다 (`devices.fingerprint_hash`) |
| 오류 | HTTP 상태 코드 + `{ "error": { "code": "WRONG_CODE", "message": "강의실 코드가 맞지 않아요" } }`. `message`는 화면에 그대로 보여 줄 수 있는 한국어 |
| 요청 횟수 제한 | 로그인: 계정당 5분에 10회, IP당 5분에 120회 (학교 Wi-Fi는 IP를 같이 쓰므로 넉넉하게). 관리자 로그인: 계정당 5분 10회, IP당 30회. 학교 코드: 5번 틀리면 처음부터 다시 로그인. 출석: 학생당 1분에 10회. 학생 문의: 1시간에 10회. 전체(Nginx 공개 입구): 접속자당 초당 10회, 순간 60회까지 |

### 주요 오류 코드

| 코드 | HTTP | 뜻 |
|---|---|---|
| `UNAUTHORIZED` | 401 | 로그인 필요 또는 세션 만료 (3시간) |
| `FORBIDDEN` | 403 | 권한 없음 (예: 다른 학교 데이터, 보기 권한 인솔자의 수정) |
| `NOT_FOUND` | 404 | 대상 없음 |
| `VALIDATION` | 400 | 입력값 오류. `error.fields`에 칸별 메시지 |
| `LOGIN_FAILED` | 401 | 학교·학번(직번)·이름이 등록 정보와 다름 |
| `SCHOOL_CODE_FAILED` | 401 | 학교 코드가 틀림 |
| `TOO_MANY_REQUESTS` | 429 | 요청 횟수 초과 |
| `SETUP_REQUIRED` | 409 | 첫 설정이 끝나지 않음 |
| `SETUP_DONE` | 409 | 첫 설정이 이미 끝남 (첫 설정 API를 다시 부름) |
| `DUPLICATE` | 409 | 이미 등록된 값 (학번·직번·학교명·장소명 등 중복) |
| `ALREADY_DECIDED` | 409 | 이미 처리된 승인 요청·변경 신청 |
| `ALREADY_REQUESTED` | 409 | 같은 출석에 처리 중인 변경 신청이 있음 |
| `IN_USE` | 409 | 출석 기록이 있는 수업은 지울 수 없음 |

## 출석 판정 결과 (`result`)

출석 요청(`POST /api/student/attendance`)의 결과. 판정 순서는 ① 시간 → ② 거리 → ③ 코드 → ④ 같은 기기 → ⑤ 등록 기기.

| result | 저장 | 화면 |
|---|---|---|
| `present` | 출석 확정 | 출석 (초록) |
| `late` | 지각 확정 | 지각 (주황) |
| `pending_device` | 기기 승인 대기 | 승인 대기 + 경고 문구 |
| `proxy_canceled` | 출석 취소 (결석 집계) | 출석이 취소되었어요 |
| `too_early` | 시도만 기록 | 아직 출석 시간이 아니에요 (시작 5분 전부터) |
| `closed` | 시도만 기록 | 수업이 끝났어요 |
| `out_of_range` | 시도만 기록 | 출석 장소에서 멀어요 (거리·허용 반경 표시) |
| `gps_denied` | 시도만 기록 | 위치 권한이 필요해요 |
| `code_wrong` | 시도만 기록 | 강의실 코드가 맞지 않아요 |
| `already` | 저장 안 함 | 이미 처리된 출석 (현재 상태 표시) |
| `not_enrolled` | 저장 안 함 | 수강 정보가 없어요 → 문의 |

- 거리 판정: `거리 − min(GPS 정확도, 50m) ≤ 허용 반경`이면 통과 (실내 GPS 오차 보정).
- 강의실 코드: 수업별로 30초마다 바뀌는 4자리. 서버가 `수업 ID + 30초 구간`으로 계산하므로(HMAC) 따로 저장하지 않는다. 직전 구간 코드까지 인정한다 (입력하는 사이에 바뀌는 경우).
- 출석·지각: 시작 5분 전 ~ 시작 5분 후 출석, 그 뒤 종료 시각까지 지각. 기기 승인 건은 **승인 시각**으로 판정하고, 종료 후 승인이면 결석.

---

## 1. 공통·로그인

### ✅ `GET /api/health`
상태 확인 (UptimeRobot, Docker). 응답 `{ "status": "ok", "db": "ok", "redis": "ok", "time": "..." }`

### ✅ `GET /api/schools`
로그인 화면 학교 목록. 응답 `[{ "id": 1, "name": "한국대" }]`

### ✅ `POST /api/auth/student/login`
요청 `{ "schoolId": 1, "studentNo": "20231234", "name": "홍길동" }`

응답
```json
{
  "role": "student",
  "student": { "id": 7, "schoolName": "한국대", "department": "컴퓨터공학과", "studentNo": "20231234", "name": "홍길동" },
  "needsConsent": true,
  "device": "registered"
}
```
- `device`: `registered`(이 기기가 등록 기기) / `newly_registered`(처음 로그인이라 지금 등록함) / `unregistered`(다른 기기가 등록되어 있음 → 출석하면 승인 대기)
- 처음 로그인이어도 이 기기가 **다른 학생의 등록 기기**이면 등록하지 않는다 (`unregistered`).
- 실패 시 `LOGIN_FAILED`, `audit_logs`에 `login_failed` 기록.

### ✅ `POST /api/auth/staff/login`
요청 `{ "schoolId": 1, "staffNo": "S2024001", "name": "김담당" }` → 응답 `{ "next": "school_code" }`
- 2차 인증 전 상태의 세션을 만든다 (5분 유효, 다른 API는 쓸 수 없음).

### ✅ `POST /api/auth/staff/verify`
요청 `{ "schoolCode": "1234" }` → 응답 `{ "role": "staff", "staff": { "id": 3, "schoolId": 1, "schoolName": "한국대", "name": "김담당", "permission": "edit" } }`
- 5번 틀리면 세션을 지우고 처음부터 다시 로그인.

### ✅ `POST /api/auth/logout`
세션 삭제. 응답 `204`

### ✅ `GET /api/me`
현재 로그인 정보. 학생은 학생 로그인 응답과 같은 모양, 인솔자는 staff verify 응답과 같은 모양. 로그인 안 했으면 `401`.

## 2. 학생

### ✅ `POST /api/student/consents`
요청 `{ "privacy": true, "location": true, "version": "2026-11-v1" }` → `204`
- `privacy`는 반드시 true. `location`이 false면 출석 요청 때 `location: null`을 보내고 결과는 `gps_denied`가 된다. 이때 학생은 문의하고, 인솔자가 출결 변경 신청으로 처리한다.

### ✅ `GET /api/student/today`
```json
{
  "serverTime": "2026-11-05T00:58:00.000Z",
  "date": "2026-11-05",
  "currentSessionId": 12,
  "sessions": [
    {
      "id": 12, "period": 1, "courseName": "AI 기초", "locationName": "공학관 301",
      "startTime": "10:00", "endTime": "11:50",
      "attendFrom": "09:55", "lateFrom": "10:05",
      "status": "none", "checkedAt": null, "suspicious": false
    }
  ]
}
```
- `status`: `none`(미출) / `present` / `late` / `absent` / `excused` / `pending_device` / `canceled`
- `currentSessionId`: 지금 출석할 수 있거나 가장 가까운 다음 수업. 없으면 `null`.

### ✅ `POST /api/student/attendance`
요청
```json
{ "sessionId": 12, "code": "4827", "location": { "lat": 37.5, "lng": 127.0, "accuracy": 12 } }
```
- 위치 동의를 안 했거나 권한이 없으면 `"location": null`.

응답 `{ "result": "present", "status": "present", "decidedAt": "...", "distanceM": 32, "radiusM": 50 }`
- 실패해도 HTTP는 `200`이고 `result`로 구분한다 (화면이 이유를 보여 주기 쉽게).

### ⏳ `GET /api/student/attendance`
내 출석 내역 (날짜별).

### ✅ `POST /api/student/tickets` · `GET /api/student/tickets`
요청 `{ "category": "출석 불가", "sessionId": 12, "content": "...", "diagnostics": { "userAgent": "...", "appVersion": "1.0.0" } }`
- 서버가 마지막 출석 시도 결과를 `diagnostics`에 붙인다. 좌표는 받지도 저장하지도 않는다.
- 목록 응답: `[{ "id", "category", "status", "content", "createdAt", "messages": [{ "authorType", "body", "createdAt" }] }]`

## 3. 인솔자 (`/api/staff`, 담당 학교 데이터만)

| | 메서드·주소 | 내용 |
|---|---|---|
| ✅ | `GET /api/staff/sessions?date=2026-11-05` | 그날 수업 목록 (담당 학교 수강생이 있는 수업) + 출석 인원 |
| ✅ | `GET /api/staff/sessions/:id/code` | 강의실 코드 `{ "code": "4827", "secondsLeft": 18, "attended": 32, "enrolled": 45 }`. 화면이 1초마다 남은 시간을 줄이고 0이 되면 다시 부름 |
| ✅ | `GET /api/staff/attendance?date=&sessionId=&status=&q=` | 출석 현황 표 (학번·이름·위치·날짜·참가여부·동일기기 의심). `status`: 출석 상태 값, `absent`(출석 취소 포함), `suspicious`(동일기기 의심만) |
| ✅ | `GET /api/staff/attendance/export?…&format=xlsx\|csv` | 다운로드 (컬럼은 엑셀 설계서 "엑셀 양식" ⑥) |
| ✅ | `GET /api/staff/device-approvals?status=pending` | 기기 승인 요청 목록 (다른 학생의 등록 기기면 `ownerName` 표시) |
| ✅ | `POST /api/staff/device-approvals/:id/approve` | 승인 → 승인 시각 기준으로 출석·지각·결석 판정, 새 기기를 등록 기기로 |
| ✅ | `POST /api/staff/device-approvals/:id/reject` | 거절 `{ "reason": "..." }` → 결석 |
| ✅ | `POST /api/staff/students/:id/device-reset` | 등록 기기 해제 (폰 교체·분실). 다음 로그인 기기가 새로 등록됨 |
| ✅ | `GET /api/staff/students` · `POST` · `PATCH /:id` | 학생 조회·추가·수정 |
| ✅ | `POST /api/staff/import/preview` (파일) → `POST /api/staff/import/:jobId/confirm` | 학생·수강 엑셀 일괄 등록 (행별 오류 미리보기 → 확정). `GET /api/staff/import/template` 템플릿 |
| ✅ | `POST /api/staff/enrollments/all` | 담당 학교 학생 전원을 모든 수업에 수강 등록 ("전체 학생 수강") |
| ✅ | `POST /api/staff/change-requests` · `GET` | 출결 변경 신청 `{ "studentId", "sessionId", "toStatus": "excused", "reason", "ticketId" }` (10분 안에 총관리자가 답하지 않으면 우선 거절) |
| ✅ | `GET /api/staff/tickets` · `POST /:id/messages` · `POST /:id/escalate` · `POST /:id/resolve` | 학생 문의 처리, 총관리자 이관 |
| 🟡 | `POST /api/staff/tickets` (인솔자 → 총관리자 문의) | `{ category, sessionId, content }`. API는 있고 화면은 운영 시작 후 추가 |

## 4. 총관리자 (`/api/admin`, Tailscale 관리자 포트에서만)

### 첫 설정 ✅
| 메서드·주소 | 내용 |
|---|---|
| `GET /api/admin/setup/status` | `{ "completed": false, "step": "account" }` |
| `POST /api/admin/setup/account` | `{ "username", "password" }` → OTP 등록용 `{ "otpauthUrl", "qrDataUrl" }`. 총관리자가 한 명도 없을 때만 가능 |
| `POST /api/admin/setup/otp` | `{ "otp": "123456" }` 확인 |
| `POST /api/admin/setup/smtp` | `{ "host", "port", "user", "password", "fromName", "testTo" }` → 테스트 메일 발송 후 저장 |
| `POST /api/admin/setup/complete` | 첫 설정 완료. 이후 setup API는 모두 `409` |

### 로그인 ✅
`POST /api/admin/auth/login` `{ "username", "password", "otp" }`

### 관리 기능
| | 메서드·주소 | 내용 |
|---|---|---|
| ✅ | `GET/POST/PATCH /api/admin/schools` · `PUT /:id/code` | 학교, 학교 코드(4자리) 변경 |
| ✅ | `GET/POST/PATCH /api/admin/staff` | 인솔자 계정 (이메일·권한·비활성화) |
| ✅ | `GET/POST/PATCH /api/admin/locations` | 장소 (좌표·허용 반경) |
| ✅ | `GET/POST/PATCH/DELETE /api/admin/sessions` | 수업 일정 (과목·날짜·교시·시각·장소) |
| ✅ | `POST /api/admin/import/{staff\|locations\|sessions}/preview` → `confirm` | 인솔자·장소·수업 일정 엑셀 등록 |
| ✅ | `GET /api/admin/attendance` · `/export` | 전체 출석 현황 (학교 필터) |
| ✅ | `GET /api/admin/change-requests?status=pending\|auto_rejected\|done` | 출결 변경 승인 대기·재검토 대기·처리 완료 |
| ✅ | `POST /api/admin/change-requests/:id/approve` · `/reject` `{ "reason" }` | 승인(반영) / 거절(사유 필수). 재검토 대기 건도 같은 API |
| ✅ | `GET /api/admin/dashboard` | 대시보드 카드·목록 한 번에 |
| ✅ | `GET /api/admin/tickets` · `POST /:id/messages` · `/resolve` | 이관 문의·인솔자 문의, 전체 기록 |
| ✅ | `GET /api/admin/settings/smtp` · `PUT /api/admin/settings/smtp` | 이메일 설정 변경 (비밀번호는 응답에 포함하지 않음, 테스트 메일이 가야 저장) |
| ⏳ | `GET /api/admin/penalties` · `POST` · `POST /:id/revoke` | 대리 출석 건, 벌점·수료 불가 부여·해제 |
| ⏳ | `GET /api/admin/health` · `GET /api/admin/backups` · `POST /api/admin/backups` | 장애 현황, 백업 |

## 5. 자동 작업 (Worker, API 없음)

| 주기 | 작업 |
|---|---|
| 1분 | 출결 변경 신청 10분 초과 → `auto_rejected` + 인솔자 알림 |
| 1분 | 끝난 수업의 미출 학생 → 결석 행 생성 |
| 1분 | 상태 점검 (DB·Redis·디스크·백업) → 이상 시 `incidents` + 총관리자 이메일 |
| 1분 | 보내지 못한 이메일 재시도 (최대 3회) |
| 매일 03:00 | DB 백업 (7일 보관) |
| 매시 | 24시간 넘게 처리 안 된 재검토 대기·문의 다시 알림 ⏳ |

---

## 부록: 화면용 엔드포인트 ↔ 타입 대응표

화면(`apps/web`)과 API(`apps/api`)가 함께 지키는 약속. 타입 이름은 [`apps/web/src/api/types.ts`](../apps/web/src/api/types.ts) 기준.

| 메서드·주소 | 요청 | 응답 |
|---|---|---|
| `GET /api/schools` | | `School[]` |
| `POST /api/auth/student/login` | `{ schoolId, studentNo, name }` | `StudentMe` |
| `POST /api/auth/staff/login` | `{ schoolId, staffNo, name }` | `{ next: 'school_code' }` |
| `POST /api/auth/staff/verify` | `{ schoolCode }` | `StaffMe` |
| `POST /api/auth/logout` | | 204 |
| `GET /api/me` | | `Me` (로그인 안 했으면 401) |
| `POST /api/student/consents` | `{ privacy, location, version }` | 204 |
| `GET /api/student/today` | | `Today` |
| `POST /api/student/attendance` | `AttendRequest` | `AttendResponse` |
| `GET /api/student/tickets` · `POST` | `NewTicket` | `Ticket[]` · `Ticket` |
| `GET /api/staff/sessions?date=` | | `StaffSession[]` |
| `GET /api/staff/sessions/:id/code` | | `RoomCode` |
| `GET /api/staff/attendance?date=&sessionId=&status=&q=` | | `AttendanceList` |
| `GET /api/staff/attendance/export?…&format=xlsx\|csv` | | 파일 |
| `GET /api/staff/device-approvals?status=pending\|done` | | `DeviceApproval[]` |
| `POST /api/staff/device-approvals/:id/approve` · `/reject` | `{}` · `{ reason }` | `DeviceDecision` |
| `GET /api/staff/students?q=` · `POST` · `PATCH /:id` | `StudentInput` | `StudentRow[]` · `StudentRow` |
| `POST /api/staff/students/:id/device-reset` | | 204 |
| `POST /api/staff/enrollments/all` | | `{ created: number }` |
| `GET /api/staff/import/template` | | 파일 (.xlsx) |
| `POST /api/staff/import/preview` | FormData `file` | `ImportPreview` |
| `POST /api/staff/import/:jobId/confirm` | `{ mode: 'update' \| 'skip' }` | `ImportResult` |
| `GET /api/staff/change-requests` · `POST` | `NewChangeRequest` | `ChangeRequest[]` · `ChangeRequest` |
| `GET /api/staff/tickets?status=open|escalated|resolved` (생략하면 전체) | | `Ticket[]` (`studentId`: 학생 문의면 학생 ID) |
| `POST /api/staff/tickets/:id/messages` · `/escalate` · `/resolve` | `{ body }` · `{}` · `{}` | `Ticket` |
| `GET /api/admin/setup/status` | | `SetupStatus` |
| `POST /api/admin/setup/account` | `{ username, password }` | `SetupAccountResponse` |
| `POST /api/admin/setup/otp` | `{ otp }` | 204 |
| `POST /api/admin/setup/smtp` | `SmtpInput` | 204 (테스트 메일 실패 시 400) |
| `POST /api/admin/setup/complete` | | 204 |
| `POST /api/admin/auth/login` | `{ username, password, otp }` | `AdminMe` |
| `GET /api/admin/dashboard` | | `Dashboard` |
| `GET /api/admin/schools` · `POST` · `PATCH /:id` | `{ name }` | `AdminSchool[]` · `AdminSchool` |
| `PUT /api/admin/schools/:id/code` | `{ code }` (숫자 4자리) | `AdminSchool` |
| `GET /api/admin/staff` · `POST` · `PATCH /:id` | `StaffInput` | `AdminStaff[]` · `AdminStaff` |
| `GET /api/admin/locations` · `POST` · `PATCH /:id` | `LocationInput` | `AdminLocation[]` · `AdminLocation` |
| `GET /api/admin/sessions?from=&to=` · `POST` · `PATCH /:id` · `DELETE /:id` | `SessionInput` | `AdminSession[]` · `AdminSession` · 204 |
| `GET /api/admin/import/:kind/template` | kind: `students` `staff` `locations` `sessions` | 파일 (.xlsx) |
| `POST /api/admin/import/:kind/preview` | FormData `file` (+ students는 `schoolId`) | `ImportPreview` |
| `POST /api/admin/import/:jobId/confirm` | `{ mode }` | `ImportResult` |
| `GET /api/admin/attendance?date=&sessionId=&schoolId=&status=&q=` · `/export` | | `AttendanceList` · 파일 |
| `GET /api/admin/change-requests?status=pending\|auto_rejected\|done` | | `ChangeRequest[]` |
| `POST /api/admin/change-requests/:id/approve` · `/reject` | `{}` · `{ reason }` | `ChangeRequest` |
| `GET /api/admin/tickets?scope=admin\|all&status=` | | `Ticket[]` |
| `POST /api/admin/tickets/:id/messages` · `/resolve` | `{ body }` · `{}` | `Ticket` |
| `GET /api/admin/device-approvals?status=` · approve · reject | | 인솔자와 같음 (전체 학교) |
| `GET /api/admin/settings/smtp` · `PUT` | `SmtpInput` (비밀번호를 비우면 기존 값 유지) | `SmtpSettings` |
