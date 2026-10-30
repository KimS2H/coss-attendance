# ERD · 테이블 명세

- 다이어그램: [diagrams/erd.svg](diagrams/erd.svg) (보기용, 영역별로 배치) · [diagrams/erd.mmd](diagrams/erd.mmd) (편집용 Mermaid, GitHub에서 바로 그림으로 보임)
- 테이블을 바꾸면 이 문서와 erd.mmd를 먼저 고치고, 보기용 SVG는 나중에 맞춘다.
- DB: PostgreSQL / 임시 값: Redis (맨 아래 참고)
- 구현: [`apps/api/prisma/schema.prisma`](../apps/api/prisma/schema.prisma)가 이 문서와 같은 내용이다. 표의 타입은 PostgreSQL 기준.
- ID는 모두 `int` (학생 50명 규모라 `bigint`가 필요 없음).
- 관련 문서: [요구사항_화면설계.xlsx](요구사항_화면설계.xlsx) · [usecase.md](usecase.md) · [architecture.md](architecture.md)

## 설계 원칙

1. **출석 기록은 두 단계로 나눈다.** 버튼을 누를 때마다 `attendance_attempts`(시도 기록)에 쌓고, 최종 결과는 `attendances`에 학생·수업당 1건만 둔다.
2. **"미출"은 행이 없는 상태다.** 수강(`enrollments`)은 있는데 `attendances` 행이 없으면 미출이다. 수업이 끝나면 스케줄러가 결석(absent) 행을 만든다.
3. **좌표 원본은 저장하지 않는다.** 거리(m)와 GPS 정확도, 판정 결과만 저장한다 (개인정보 최소 저장).
4. **비밀값은 해시나 암호화로 저장한다.** 학교 코드, 기기 쿠키, 관리자 비밀번호, 이메일 발송 비밀번호가 해당된다. 암호화 키는 서버의 `.env`에만 두고 저장소에는 올리지 않는다.
5. **"누가 했는지"는 `*_type` + `*_id`로 기록한다.** 인솔자와 총관리자가 같은 작업을 할 수 있어서 한 테이블을 가리키는 외래키 대신 두 칸으로 기록한다.
6. **모든 시각은 서버 시각이다.** `timestamptz` 형식을 쓰고 화면에는 한국 시간으로 표시한다.
7. **사람이 출석 상태를 바꾸려면 신청과 승인을 거친다.** 인솔자가 `attendance_change_requests`에 신청하고 총관리자가 승인하면 `attendances`가 바뀌고 `attendance_changes`에 이력이 남는다. 자동 판정(출석 체크, 기기 승인, 자동 결석, 대리 출석 자동 취소)은 신청 없이 바로 반영한다.
8. **대리 출석은 "같은 수업 · 같은 기기"에서 기기 주인이 아닌 계정을 자동 취소한다.** 기기 주인(그 기기가 `active`로 등록된 학생)은 순서와 관계없이 유지하고, 둘 다 주인이 아니면 두 번째 계정을 취소한다. 취소와 불이익은 `penalties`에 남긴다.

## 테이블 목록

| 영역 | 테이블 | 설명 |
|---|---|---|
| 조직·계정 | schools | 학교와 학교 코드 |
| | staff | 인솔자 |
| | admins | 총관리자 |
| 학생 | students | 학생 |
| | consents | 개인정보·위치정보 동의 이력 |
| | devices | 학생 기기 (브라우저 기기 쿠키의 해시) |
| 수업 | courses | 과목 |
| | locations | 수업 장소 (좌표·반경) |
| | sessions | 수업 회차 (날짜·교시·장소) |
| | enrollments | 수강 (학생 ↔ 회차) |
| 출석 | attendance_attempts | 출석 버튼을 누를 때마다 남는 시도 기록 |
| | attendances | 최종 출석 결과 (학생·회차당 1건) |
| | attendance_changes | 출석 상태 수정 이력 |
| | device_approvals | 미등록 기기 승인 요청 |
| | attendance_change_requests | 출결 변경 신청 (인솔자 신청 → 총관리자 승인, 10분 초과 시 우선 거절) |
| | penalties | 대리 출석 불이익 (출석 취소 · 벌점 · 수료 불가) |
| 문의 | tickets | 문의·오류 신고 (학생·인솔자) |
| | ticket_messages | 문의 답변 |
| 운영 | import_jobs | 엑셀 일괄 등록 작업 |
| | audit_logs | 작업 로그 (로그인 실패, 코드 변경, 기기 초기화 등) |
| | notifications | 화면 알림·이메일 발송 기록 |
| | incidents | 장애 기록 (상태 점검 결과) |
| | backups | 백업 기록 |
| | app_settings | 운영 설정 (이메일 발송 계정 등, 첫 설정 화면에서 입력) |

## 테이블 상세

### schools — 학교
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | int PK | |
| name | varchar | 학교명 (예: 한국대). 고유 |
| code_hash | varchar | 학교 코드 4자리의 해시. 원문은 저장하지 않음 |
| code_changed_at | timestamptz | 코드 변경 시각 (변경은 총관리자만) |
| created_at | timestamptz | |

### staff — 인솔자
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | int PK | |
| school_id | int FK → schools | 담당 학교 |
| staff_no | varchar | 직번. `(school_id, staff_no)` 고유 |
| name | varchar | 이름 |
| email | varchar | 기기 승인 요청 메일 수신 주소 (필수) |
| permission | varchar | `view`(보기) / `edit`(수정) |
| is_active | bool | 비활성화 시 로그인 불가 |
| created_at | timestamptz | |

### admins — 총관리자
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | int PK | |
| username | varchar | 아이디. 고유 |
| password_hash | varchar | 비밀번호 해시 |
| is_active | bool | |
| last_login_at | timestamptz | |

### students — 학생
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | int PK | |
| school_id | int FK → schools | |
| student_no | varchar | 학번 (앞자리 0 유지를 위해 문자). `(school_id, student_no)` 고유 |
| name | varchar | 이름 |
| college | varchar | 단과대 |
| department | varchar | 학과 |
| is_active | bool | |
| created_at | timestamptz | |

### consents — 동의 이력
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | int PK | |
| student_id | int FK → students | |
| consent_type | varchar | `privacy`(개인정보) / `location`(위치정보) |
| version | varchar | 동의서 버전. 동의서가 바뀌면 다시 동의받음 |
| agreed_at | timestamptz | |

### devices — 학생 기기
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | int PK | |
| student_id | int FK → students | |
| fingerprint_hash | varchar | 기기 쿠키(`did`, 처음 접속한 브라우저에 서버가 주는 임의 값)의 HMAC 해시 |
| user_agent | varchar | 브라우저·기기 정보 (승인 화면 표시용) |
| status | varchar | `active`(등록 기기) / `pending`(승인 대기) / `rejected`(거절) / `retired`(초기화·교체됨) |
| first_seen_at | timestamptz | 처음 쓰인 시각 |
| retired_at | timestamptz | 초기화·교체 시각 |

- 학생당 `active` 기기는 1개만 허용 (부분 고유 인덱스).
- 동일기기 의심: 같은 `fingerprint_hash`가 다른 학생의 기기로도 있으면 의심.

### courses — 과목
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | int PK | |
| name | varchar | 과목명. 고유 (엑셀 수강 시트에서 이름으로 찾음) |

### locations — 장소
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | int PK | |
| name | varchar | 장소명 (예: 공학관 301) |
| latitude | numeric(9,6) | 위도 |
| longitude | numeric(9,6) | 경도 |
| radius_m | int | 허용 반경. 기본 50 |

### sessions — 수업 회차
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | int PK | |
| course_id | int FK → courses | |
| location_id | int FK → locations | 교시마다 장소가 다를 수 있음 |
| class_date | date | 수업 날짜 |
| period | int | 교시. `(course_id, class_date, period)` 고유 |
| start_time | varchar(5) | 시작 시각 `"HH:MM"` (한국 시각) |
| end_time | varchar(5) | 종료 시각 `"HH:MM"` |

- 출석 가능 시간은 저장하지 않고 계산한다: 시작 5분 전 ~ 5분 후 출석, 이후 종료까지 지각.

### enrollments — 수강
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | int PK | |
| student_id | int FK → students | `(student_id, session_id)` 고유 |
| session_id | int FK → sessions | |
| created_at | timestamptz | |

- 추가·수정·삭제는 `audit_logs`에 기록한다.

### attendance_attempts — 출석 시도
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | int PK | |
| student_id | int FK → students | |
| session_id | int FK → sessions | |
| device_id | int FK → devices | |
| attempted_at | timestamptz | 서버 시각 |
| result | varchar | 성공: `present` / `late` / `pending_device`(승인 대기) / `proxy_canceled`(같은 기기, 주인이 아닌 계정) · 실패: `too_early` / `closed` / `gps_denied`(위치 없음) / `out_of_range` / `code_wrong` |
| distance_m | int | 장소까지 거리 |
| gps_accuracy_m | int | GPS 정확도 |

- 실패 원인 안내, 문의 링크 표시, 장애 분석에 쓴다.

### attendances — 최종 출석
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | int PK | |
| student_id | int FK → students | `(student_id, session_id)` 고유 → 중복 출석 방지 |
| session_id | int FK → sessions | |
| device_id | int FK → devices | 출석에 쓴 기기 (자동 결석이면 비어 있음) |
| status | varchar | `present`(출석) / `late`(지각) / `absent`(결석) / `excused`(공결) / `pending_device`(기기 승인 대기) / `canceled`(대리 출석 취소, 결석으로 집계) |
| checked_at | timestamptz | 학생이 출석을 요청한 시각 |
| decided_at | timestamptz | 판정 기준 시각. 보통 `checked_at`과 같고, 기기 승인 건은 **승인 시각** |
| distance_m | int | 장소까지 거리 (화면의 "위치" 컬럼: "반경 내 (35m)") |
| suspicious | bool | 동일기기 의심 |
| suspicious_reason | varchar | 예: 같은 기기 2명, 미등록 기기, 다른 학생 기기로 출석(취소) |

- 대리 출석 판정: 같은 기기(`devices.fingerprint_hash`가 같음)로 **같은 수업에 다른 학생의 출석 행**이 있으면 아래처럼 처리하고, 두 행 모두 `suspicious = true`로 바꾼다.
  - 지금 요청한 학생이 기기 주인이면 → 요청한 학생은 정상 판정, 먼저 있던 다른 학생의 행을 `canceled`로 바꾼다.
  - 먼저 있던 학생이 기기 주인이거나, 둘 다 주인이 아니면 → 지금 요청한 학생을 `canceled`로 저장한다.

### attendance_changes — 출석 수정 이력
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | int PK | |
| attendance_id | int FK → attendances | |
| request_id | int FK → attendance_change_requests | 승인된 변경 신청 (자동 처리면 비어 있음) |
| from_status / to_status | varchar | 변경 전·후 상태 |
| reason | text | 수정 사유 (필수) |
| changed_by_type / changed_by_id | varchar / int | `staff` / `admin` / `system` |
| changed_at | timestamptz | |

### device_approvals — 기기 승인 요청
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | int PK | |
| attendance_id | int FK → attendances | 승인 대기 중인 출석 |
| device_id | int FK → devices | 새 기기 |
| status | varchar | `pending` / `approved` / `rejected` |
| requested_at | timestamptz | 요청 시각 |
| decided_by_type / decided_by_id | varchar / int | 처리한 인솔자 또는 총관리자 |
| decided_at | timestamptz | 처리 시각. **승인이면 이 시각으로 출석·지각 판정** |
| reject_reason | text | 거절 사유 |

- 승인 시: 새 기기를 `active`로, 이전 기기를 `retired`로 바꾸고 `attendances.decided_at`을 승인 시각으로 정해 상태를 판정한다. 수업 종료 후 승인이면 결석을 유지한다.

### attendance_change_requests — 출결 변경 신청
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | int PK | |
| attendance_id | int FK → attendances | 바꿀 출석. 미출이면 신청 시 결석 행을 먼저 만든다 |
| ticket_id | int FK → tickets | 연결된 문의 (없을 수 있음) |
| requested_by | int FK → staff | 신청한 인솔자 |
| from_status / to_status | varchar | 현재 상태 → 바꿀 상태 (`present` / `late` / `absent` / `excused`) |
| reason | text | 신청 사유 (필수) |
| status | varchar | `pending`(대기) / `approved`(승인) / `rejected`(거절) / `auto_rejected`(10분 초과 우선 거절, 재검토 대기) |
| auto_rejected_at | timestamptz | 우선 거절된 시각 |
| decided_by | int FK → admins | 처리한 총관리자 |
| decided_at | timestamptz | |
| reject_reason | text | 미승인 사유 (필수) |
| created_at | timestamptz | |

- 승인 시: `attendances.status`를 바꾸고 `attendance_changes`에 `request_id`와 함께 이력을 남긴다. 인솔자와 학생에게 알린다.
- 같은 출석에 대기 중인 신청(`pending`, `auto_rejected`)은 1건만 허용한다.
- 스케줄러가 1분마다 확인해, 신청 후 10분이 지난 `pending`을 `auto_rejected`로 바꾼다. 출석은 바뀌지 않는다. 총관리자가 나중에 승인하면 `approved`로 반영하고, 거절을 확정하면 `rejected`(사유 필수)가 된다.

### penalties — 대리 출석 불이익
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | int PK | |
| student_id | int FK → students | 불이익을 받는 학생 |
| attendance_id | int FK → attendances | 관련 출석 (없을 수 있음) |
| kind | varchar | `attendance_cancel`(출석 취소) / `points`(벌점) / `no_completion`(수료 불가) |
| points | int | 벌점 점수 (`points`일 때만) |
| reason | text | 사유 (필수) |
| decided_by_type / decided_by_id | varchar / int | `system`(자동 출석 취소) / `admin` |
| created_at | timestamptz | |
| revoked_at | timestamptz | 해제 시각 (잘못 준 경우) |
| revoke_reason | text | 해제 사유 |

- 출석 취소는 대리 출석 감지 때 시스템이 자동으로 남긴다. 벌점과 수료 불가는 총관리자가 정한다 (점수·기준은 사업 규정).
- 학생별 누적 벌점 = 해제되지 않은 `points`의 합.

### tickets — 문의·오류 신고
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | int PK | |
| school_id | int FK → schools | 작성자 소속 학교 (담당 인솔자 배정 기준) |
| session_id | int FK → sessions | 관련 수업 (없을 수 있음) |
| reporter_type / reporter_id | varchar / int | `student` / `staff` |
| category | varchar | 학생: 출석 불가, 위치 인식 불가, 코드 입력 불가, 로그인 불가, 기기 변경·분실, 수업 정보 오류, 기타 / 인솔자: 정보 변경 불가, 학생 인식 불가, 엑셀 등록 오류, 강의실 코드 표시 오류, 출석 현황·다운로드 오류, 로그인·학교 코드 문제, 알림·이메일 미수신, 기타 |
| content | text | 내용 |
| diagnostics | jsonb | 자동 첨부: 기기 정보, 마지막 출석 시도 결과, 앱 버전 (좌표 제외) |
| status | varchar | `open`(접수) / `in_progress`(처리 중) / `escalated`(총관리자 이관) / `resolved`(해결) |
| assignee | varchar | `staff`(학생 문의 기본) / `admin`(인솔자 문의, 이관된 문의) |
| escalated_at / resolved_at | timestamptz | |
| created_at | timestamptz | |

- 학생 문의는 같은 학교 인솔자가 처리하고, 이관하면 `assignee = admin`이 된다. 총관리자는 모든 문의를 볼 수 있다.

### ticket_messages — 문의 답변
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | int PK | |
| ticket_id | int FK → tickets | |
| author_type / author_id | varchar / int | `student` / `staff` / `admin` |
| body | text | |
| created_at | timestamptz | |

### import_jobs — 엑셀 일괄 등록
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | int PK | |
| school_id | int FK → schools | 대상 학교 (인솔자는 본인 학교로 고정) |
| uploaded_by_type / uploaded_by_id | varchar / int | `staff` / `admin` |
| kind | varchar | `students`(학생·수강) / `staff` / `locations` / `sessions` |
| file_name | varchar | |
| status | varchar | `preview`(미리보기) / `confirmed`(확정) / `failed` |
| created_count / updated_count / skipped_count | int | 등록 결과 |
| errors | jsonb | 행별 오류 목록 |
| payload | jsonb | 확정 전까지 보관하는 읽은 행 (확정하면 비움) |
| created_at | timestamptz | |

### audit_logs — 작업 로그
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | int PK | |
| actor_type / actor_id | varchar / int | `student` / `staff` / `admin` / `system` |
| action | varchar | 예: `login_failed`, `school_code_failed`, `school_code_changed`, `device_reset`, `enrollment_deleted` |
| target_type / target_id | varchar / int | 대상 |
| detail | jsonb | 상세 |
| ip | varchar | |
| created_at | timestamptz | |

### notifications — 알림 발송
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | int PK | |
| recipient_type / recipient_id | varchar / int | `staff` / `admin` |
| recipient_email | varchar | 이메일일 때 받는 주소 (총관리자는 첫 설정의 알림 주소) |
| channel | varchar | `in_app`(화면 알림) / `email` |
| kind | varchar | `device_approval` / `ticket` / `change_request` / `change_auto_rejected` / `proxy_attendance` / `incident` |
| title / body | varchar / text | |
| send_status | varchar | `pending` / `sent` / `failed` (이메일) |
| send_attempts | int | 보낸 횟수. Worker가 1분마다 최대 3번까지 다시 보냄 |
| read_at | timestamptz | 화면 알림 읽은 시각 |
| created_at | timestamptz | |

### incidents — 장애
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | int PK | |
| component | varchar | `api` / `db` / `redis` / `funnel` / `disk` / `backup` |
| severity | varchar | `warning` / `critical` |
| message | text | 오류 내용 |
| notified_at | timestamptz | 총관리자에게 이메일을 보낸 시각 |
| detected_at / resolved_at | timestamptz | |

- Worker가 1분마다 상태를 점검해 이상이 있으면 행을 만든다. AI 분석·자동 조치는 하지 않는다 (2026-10-29 결정).

### backups — 백업
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | int PK | |
| file_name | varchar | |
| size_bytes | int | |
| storage | varchar | `local` / `cloud` |
| status | varchar | `success` / `failed` |
| created_at | timestamptz | |


### app_settings — 운영 설정
| 컬럼 | 타입 | 설명 |
|---|---|---|
| key | varchar PK | 설정 이름 (예: `smtp.host`, `smtp.port`, `smtp.user`, `smtp.password`, `smtp.from_name`, `setup.completed_at`) |
| value | text | 설정 값. 비밀 값은 암호화해서 저장 |
| is_secret | bool | 비밀 값이면 true (화면에는 •••로 표시, 다시 보여주지 않음) |
| updated_by | int FK → admins | 마지막으로 바꾼 총관리자 |
| updated_at | timestamptz | |

- 서버를 처음 켜면 `setup.completed_at`이 없으므로 첫 설정 화면(`/admin/setup`)이 열린다.

## Redis (임시 값, 사라져도 되는 것만)

| 키 | 값 | 만료 |
|---|---|---|
| `sess:{토큰}` | 로그인 세션 (역할, ID, 학교, 학교 코드 틀린 횟수) | 3시간 (학교 코드 입력 전 상태는 5분) |
| `rl:login:s:{학교}:{학번}` · `rl:login:t:{학교}:{직번}` | 로그인 시도 횟수 (계정당 5분 10회) | 5분 |
| `rl:login-ip:{IP}` · `rl:admin-login…` | IP별·관리자 로그인 시도 횟수 | 5분 |
| `rl:attend:{학생}` | 출석 요청 횟수 (1분 10회) | 1분 |
| `rl:ticket:{학생}` | 문의 작성 횟수 (1시간 10회) | 1시간 |

- 강의실 코드는 Redis에 저장하지 않는다. `수업 ID + 30초 구간`을 APP_SECRET으로 계산한다 (직전 구간까지 인정).
- 같은 수업 출석의 동시 처리는 Redis 잠금 대신 PostgreSQL 잠금(`pg_advisory_xact_lock`)으로 한다.
- 부분 고유 인덱스(마이그레이션 SQL에 직접 추가): 학생당 `active` 기기 1개, 출석당 대기 중(`pending`·`auto_rejected`) 변경 신청 1건.

## 개인정보 파기

프로그램 종료 1년 후 `students`, `consents`, `devices`, `enrollments`, `attendance_attempts`, `attendances`, `attendance_changes`, `device_approvals`, `attendance_change_requests`, `penalties`, 학생이 쓴 `tickets`·`ticket_messages`와 학생 관련 `audit_logs`를 삭제한다. 통계가 필요하면 개인 식별 정보를 지운 집계만 남긴다.
