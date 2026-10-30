# 시스템 구성도 설명

서비스 이름: **🎓 IoT 혁신융합대학 비교과 출석체크** (모든 화면 상단에 IoT COSS 로고와 함께 표시)

- 다이어그램: [diagrams/architecture.svg](diagrams/architecture.svg) (보기용) · [diagrams/architecture.puml](diagrams/architecture.puml) (편집용 PlantUML)
- 관련 문서: [usecase.md](usecase.md)

## 핵심 원칙

1. **서버는 사무실 PC 1대.** 개발 PC와는 별개이며, Docker로 두 PC의 실행 환경을 맞춘다.
2. **공유기 포트를 열지 않고, 도메인도 사지 않는다.** 서버 PC의 Tailscale이 먼저 밖으로 연결한다. Tailscale Funnel이 주는 고정 주소(`https://○○.ts.net`)로 들어온 요청은 그 연결을 타고 들어온다.
3. **관리자 화면은 두 겹으로 막는다.** 공개 입구(Funnel)로 들어온 `/admin` 요청은 Nginx가 차단한다. 관리자 화면은 Tailscale 사설망에만 열린 별도 입구(Serve)로만 들어온다.
4. **원본 데이터는 PostgreSQL에만 저장한다.** Redis에는 사라져도 되는 값(로그인 세션, 요청 횟수)만 둔다. 강의실 코드는 저장하지 않고 계산한다.

## 구성 요소

| 구성 요소 | 위치 | 역할 |
|---|---|---|
| Tailscale Funnel | 외부 (무료) | 고정 공개 주소(`○○.ts.net`)와 HTTPS 인증서 자동 발급. 학생·인솔자 화면만 공개 |
| Tailscale 사설망 | 외부 + 각 PC에 앱 설치 (무료) | 등록된 기기끼리 암호화 연결. 관리자 전용 통로 |
| Tailscale 클라이언트 | 서버 PC (Windows 앱) | 입구 두 개를 연다. Funnel `:443` → Nginx 공개 포트, Serve `:8443`(Tailscale 기기만) → Nginx 관리자 포트. 서버에서 밖으로만 연결 |
| Nginx | Docker | 요청 라우팅, React 화면 파일(반응형·PWA) 제공, 접속자별 요청 횟수 제한(초당 10회, 순간 60회까지). 포트 두 개(서버 PC 안 `127.0.0.1`에서만 열림): 공개 `8080`은 `/admin`·`/api/admin` 차단, 관리자 `8081`은 API에 비밀 헤더(`X-Admin-Gate`)를 붙여 넘김 |
| API 서버 (NestJS) | Docker | 로그인·학교 코드 2차 인증, 출석 판정(GPS 거리 + 코드 + 기기), 엑셀 업로드·다운로드, 강의실 코드 계산, 이메일 발송. 켤 때마다 DB 구조를 최신으로 맞춤(마이그레이션). `/api/admin`은 비밀 헤더가 있을 때만 응답 |
| Worker · 스케줄러 | Docker (API와 같은 이미지) | 1분마다: 끝난 수업 자동 결석, 10분 넘은 출결 변경 우선 거절, 못 보낸 이메일 재발송(3회), 상태 점검(DB·Redis·디스크·백업) → 이상 시 총관리자 이메일. 매일 03:00 DB 백업(`pg_dump`) |
| Redis | Docker | 로그인 세션(학생·인솔자 3시간, 총관리자는 로그아웃할 때까지), 요청 횟수 제한. 서버를 다시 켜도 로그인이 유지되도록 디스크(`data/redis`)에 1초마다 저장. 동시 출석 순서는 PostgreSQL 잠금으로 처리 |
| PostgreSQL | Docker | 학생, 수업, 출석, 기기, 수정 이력 등 원본 데이터 |
| 로컬 디스크 | 서버 PC | `data/postgres`(DB), `backups/`(일일 백업 7일 보관). 둘 다 저장소에 올리지 않음 |
| 클라우드 백업 | 외부 | **아직 만들지 않음 (운영 시작 후 추가 예정).** 그 전까지는 `backups/` 폴더를 외장 디스크나 Google Drive에 직접 복사 |
| UptimeRobot | 외부 (무료) | 5분마다 공개 주소 `/health` 확인. 서버 PC가 꺼져도 감지 |
| 이메일 알림 | 외부 (무료) | 장애·백업 실패 → 총관리자, 미등록 기기 승인 요청 → 담당 인솔자. Gmail SMTP 등. 발송 계정은 총관리자가 첫 설정 화면에서 입력 |
| GitHub | 외부 (무료) | 공개 저장소. 코드만 올리고 비밀 정보·DB 내용은 올리지 않음 (아래 "공개 저장소 규칙") |

## 주요 흐름

1. **출석:** 학생 폰 → Tailscale Funnel(HTTPS, `○○.ts.net`) → 서버 PC Tailscale → Nginx 공개 포트(8080) → API → Redis(세션·요청 횟수) → PostgreSQL(수업별 잠금·저장)
2. **관리자:** 인증된 PC → Tailscale 사설망 → Serve(`:8443`) → Nginx 관리자 포트(8081) `/admin`
   - 미등록 기기 승인 요청: API → 이메일 → 담당 인솔자 (화면 알림도 함께)
3. **장애:** Worker 상태 점검·UptimeRobot → 총관리자 이메일. 멈춘 컨테이너는 Docker가 자동으로 다시 시작(`restart: unless-stopped`)
4. **배포:** 개발 PC → GitHub(push) → 서버 PC에서 pull → `docker compose up -d --build`

## 서버 PC 준비 사항

- Windows 자동 로그인, Docker Desktop 자동 시작 (재부팅 후 서비스 자동 복구)
- Windows 업데이트 재시작 시간을 새벽으로 지정, 절전 모드 끄기
- UPS 연결 (정전 대비)
- 학교 네트워크 사용은 허용됨 (2026-10-28)
- Tailscale 관리 콘솔에서 MagicDNS와 HTTPS 인증서를 켜고, 접근 정책에 서버 PC의 Funnel 허용을 추가
- `tailscale funnel`과 `tailscale serve`를 백그라운드 모드로 설정해 재부팅 후에도 유지

## 비용

| 항목 | 비용 |
|---|---|
| 도메인 | 없음 (Funnel 주소 사용) |
| Tailscale(Funnel 포함), UptimeRobot, GitHub, Google Drive(백업 복사용) | 무료 |
| UPS | 일회성 장비 구매 |

## 기술 스택 (2026-10-28 결정, 2026-10-29 버전 고정)

| 구분 | 사용 | 고정 버전 |
|---|---|---|
| 언어 | TypeScript | 5.9 |
| 화면 | React (반응형, PWA) + Vite + react-router | React 19.1 · Vite 6 · react-router 7 · vite-plugin-pwa 1 |
| API · Worker | NestJS + Prisma(DB 접근) + zod(입력 검사) | NestJS 11 · Prisma 6.19 · zod 3 |
| 데이터 | PostgreSQL + Redis | PostgreSQL 16 · Redis 7 |
| 실행 | Docker Compose + Nginx | Node 22 · Nginx 1.27 |
| 테스트 | Jest + 내장 PostgreSQL(embedded-postgres) | Jest 29 |

- 더 새로운 메이저 버전(NestJS 12, Prisma 7·8, Vite 8 등)이 있지만, 일정이 촉박해 충분히 검증된 버전으로 고정했다.
- 저장소 구성: `apps/api`(API·Worker), `apps/web`(화면), `docker/nginx`, `docker-compose.yml`. 자세한 실행 방법은 [README](../README.md).

## 접속 주소: Tailscale Funnel (2026-10-28 결정)

### 왜 Funnel인가

- 학교 하위 도메인은 쓸 수 없고, 도메인은 사지 않기로 했다.
- Cloudflare Tunnel은 도메인이 있어야 고정 주소를 쓸 수 있다. 도메인 없이 쓰는 임시 주소(trycloudflare.com)는 재시작할 때마다 바뀐다.
- Funnel은 무료로 고정 HTTPS 주소를 준다. 관리자 통로로 이미 쓰는 Tailscale 하나로 공개 입구와 관리자 입구를 함께 운영할 수 있다.

### 주소

- 형식: `https://<서버 PC 이름>.<tailnet 이름>.ts.net`
- 서버 PC 이름은 짧게 정한다 (예: `coss`). tailnet 이름은 관리 콘솔에서 제시하는 이름 중에서 고른다.
- 주소가 길어서 직접 입력하기 어렵다. 그래서 오리엔테이션 때 **QR 코드**로 접속하고 **홈 화면에 추가(PWA)** 하도록 안내한다. 인솔자 코드 화면 구석에도 QR을 띄운다.

### Cloudflare 안과 달라지는 점

| 항목 | Cloudflare (이전 안) | Funnel (결정) | 대응 |
|---|---|---|---|
| 도메인 | 필요 (연 1~2만 원) | 불필요 | — |
| HTTPS | 자동 | 자동 (Let's Encrypt) | — |
| 공격 차단 (WAF·DDoS) | 있음 | 없음 | Nginx·API에서 IP별 요청 횟수 제한, 로그인 실패 잠금 |
| `/admin` 차단 | Cloudflare 규칙 | Nginx 공개 포트에서 차단 | 관리자 화면은 Serve 입구로만 |
| 속도 | 넉넉함 | 대역폭 제한이 있음 (수치 비공개) | 50명 규모의 출석 요청은 작아서 문제없을 것으로 본다. 첫 수업 전에 동시 접속 시험 |

### 첫 수업 전 확인할 것

1. 학생 폰을 학교 Wi-Fi와 LTE에 각각 연결해 Funnel 주소가 열리는지 (학교 방화벽이 `ts.net`을 막지 않는지)
2. 50명이 1분 안에 동시에 출석해도 3초 안에 응답하는지
3. 서버 PC를 재부팅해도 Funnel과 Serve가 자동으로 다시 열리는지
4. UptimeRobot이 Funnel 주소의 `/health`를 정상으로 보는지

## AI 모니터 제외 (2026-10-29 결정)

예산이 없어 Claude API를 쓰는 AI 원인 분석·자동 조치는 만들지 않는다. 대신 아래 세 가지로 장애에 대응한다.

- Worker가 1분마다 API·DB·Redis·디스크·백업 상태를 점검하고, 이상이 있으면 총관리자에게 이메일을 보낸다.
- UptimeRobot이 밖에서 5분마다 공개 주소를 확인한다 (서버 PC가 꺼져도 감지).
- 컨테이너가 멈추면 Docker가 자동으로 다시 시작한다.

## 이메일 설정 (2026-10-29 결정)

메일 발송 계정은 코드나 설정 파일에 적지 않는다. 서버를 처음 켜면 총관리자 첫 설정 화면(`/admin/setup`)이 열리고, 여기서 총관리자 계정과 함께 이메일 발송 정보(SMTP 서버, 포트, 계정, 앱 비밀번호, 보내는 사람 이름)를 입력한다. 테스트 메일을 보내 확인한 뒤 저장한다.

- 저장 위치: DB의 `app_settings` 테이블. 비밀번호는 서버의 암호화 키(`.env`의 `APP_SECRET`)로 암호화해 저장한다.
- 나중에 바꿀 때: 총관리자 설정 화면(`/admin/settings`).

## 공개 저장소 규칙 (2026-10-29 결정)

GitHub 공개 저장소에 올리되, 아래 정보는 절대 올리지 않는다.

| 올리지 않는 것 | 막는 방법 |
|---|---|
| 비밀번호, 암호화 키, DB 접속 정보, 메일 계정 | `.env`에만 두고 `.gitignore`로 제외. 저장소에는 값이 빈 `.env.example`만 올림 |
| DB 내용 (학생 명단, 출석 기록) | DB 볼륨·백업 파일·업로드한 엑셀 폴더를 `.gitignore`로 제외. 테스트 데이터는 가짜 이름만 사용 |
| 실제 접속 주소 (`○○.ts.net`), 학교 코드 | 문서와 코드에는 예시 값만 적음 |
| 실수로 올리는 것 | 커밋 전에 비밀 정보 검사 도구(gitleaks)를 자동 실행해 걸리면 커밋을 막음 |
