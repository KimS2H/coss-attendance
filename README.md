# 🎓 IoT 혁신융합대학 비교과 출석체크

비교과 프로그램 출석 웹앱. 학생은 휴대폰으로 **GPS 위치 + 강의실 코드(4자리, 30초마다 바뀜)** 로 출석하고, 인솔자는 담당 학교 출석을 관리하며, 총관리자는 사무실 PC(서버)에서 전체를 관리한다.

- **진행 상황·남은 일·일정: [docs/진행상황.md](docs/진행상황.md)**
- 설계 문서: [`docs/`](docs) — 요구사항·화면 설계서(엑셀), [API 명세](docs/api.md), [ERD](docs/erd.md), [출석 흐름](docs/attendance-flow.md), [시스템 구성](docs/architecture.md), [유스케이스](docs/usecase.md)
- 기술: TypeScript · React(화면) · NestJS(API) · PostgreSQL · Redis · Docker Compose · Tailscale Funnel

> ⚠️ **공개 저장소 규칙**: 비밀번호·암호화 키·DB 내용(학생 명단·출석 기록)·실제 접속 주소·학교 코드는 절대 올리지 않는다. `.env`, `data/`, `backups/`, 엑셀 파일은 `.gitignore`로 막혀 있다. 커밋 전 검사: `npm run hooks:install` (한 번) + `winget install gitleaks.gitleaks`.

---

## 폴더 구성

| 폴더 | 내용 |
|---|---|
| `apps/api` | API 서버 + Worker (NestJS). 출석 판정 규칙은 `src/attendance/rules.ts` |
| `apps/api/prisma` | DB 구조(`schema.prisma`)와 변경 기록(`migrations`) |
| `apps/web` | 화면 (React). `src/pages/student` 학생 · `staff` 인솔자 · `admin` 총관리자 |
| `docker/nginx` | Nginx 설정 (공개 입구 8080 / 관리자 입구 8081) |
| `docs` | 설계 문서 |

---

## 서버 PC에 설치하기 (처음 한 번)

1. **프로그램 설치**
   - Docker Desktop (설치 중 "WSL 2" 선택 → 재부팅): https://www.docker.com/products/docker-desktop/
   - Git: `winget install Git.Git`
   - Tailscale: https://tailscale.com/download → 로그인
2. **코드 받기**: `git clone <저장소 주소> C:\coss-attendance` → `cd C:\coss-attendance`
3. **비밀 값 파일 만들기**: `copy .env.example .env` 후 메모장으로 열어 `APP_SECRET`, `ADMIN_GATE_SECRET`, `POSTGRES_PASSWORD`를 채운다. 값 만드는 방법은 파일 안에 적혀 있다. **이 파일은 따로 안전하게 보관** (잃어버리면 이메일 설정·OTP를 다시 해야 함).
4. **켜기**: `docker compose up -d --build` → `docker compose ps`에서 모두 `running`/`healthy`인지 확인
5. **인터넷에 공개 (Tailscale)**
   - 학생·인솔자용 공개 주소: `tailscale funnel --bg 8080`
   - 총관리자용 (Tailscale 등록 PC만): `tailscale serve --bg --https=8443 8081`
   - 주소 확인: `tailscale funnel status` → `https://<PC이름>.<tailnet>.ts.net`
   - Tailscale 관리 콘솔에서 MagicDNS·HTTPS 켜기, 접근 정책에 Funnel 허용 추가 ([architecture.md](docs/architecture.md))
6. **첫 설정**: 등록된 PC에서 `https://<PC이름>.<tailnet>.ts.net:8443/admin` 접속 → 총관리자 계정 → OTP(휴대폰 Google Authenticator) → 이메일 발송 계정(Gmail은 2단계 인증 후 "앱 비밀번호") → 완료
7. **데이터 넣기** (총관리자 화면): 계정·학교 코드에서 학교 등록·학교 코드 정하기 → 엑셀 등록에서 인솔자 → 장소 → 수업 일정 → 학생·수강 순서로 올리기
8. **PC 설정**: Windows 자동 로그인, Docker Desktop "로그인 시 시작", 절전 끄기, 업데이트 재시작 시간을 새벽으로

### 출시 전 점검
- [ ] 학교 Wi-Fi와 LTE에서 공개 주소가 열리는지
- [ ] 휴대폰 50대로 동시에 출석해도 3초 안에 응답하는지
- [ ] PC를 재부팅해도 자동으로 다시 켜지는지 (`docker compose ps`)
- [ ] UptimeRobot에 `https://<공개 주소>/api/health` 등록 (5분마다 확인, 이메일 알림)

---

## 자주 하는 일

| 하고 싶은 일 | 방법 |
|---|---|
| 새 버전으로 바꾸기 | `git pull` → `docker compose up -d --build` |
| 상태·로그 보기 | `docker compose ps` / `docker compose logs -f api` / `docker compose logs -f worker` |
| 껐다 켜기 | `docker compose restart` |
| 학생이 폰을 바꿈·잃어버림 | 인솔자 화면 → 학생·수강 관리 → "기기 초기화". 다음에 로그인한 기기가 새로 등록됨 |
| 학교 코드 바꾸기 | 총관리자 화면 → 계정·학교 코드 → 코드 변경 → 해당 학교 인솔자에게 직접 알림 |
| 이메일 계정 바꾸기 | 총관리자 화면 → 설정 |
| 백업 파일 | `backups/` 폴더 (매일 03:00, 7일 보관). 다른 곳(외장 디스크·클라우드)에도 주기적으로 복사 |
| 백업에서 되살리기 | `docker compose stop api worker` → `gunzip -c backups/<파일>.sql.gz \| docker compose exec -T db psql -U postgres -d coss` → `docker compose start api worker` (실제 데이터를 덮어쓰므로 신중히) |

---

## 개발 PC에서 실행하기

Node.js 22 이상 필요. Docker 없이도 실행된다 (개발용 PostgreSQL을 내장 실행, Redis는 메모리로 대신함).

```bash
npm install
npm run db:dev            # 창 1: 개발용 DB 켜기 (끄려면 Ctrl+C)
```

`apps/api/.env`를 만든다 (`.env.example` 아래쪽 "개발 PC" 부분 참고, `NODE_ENV=development`, `DATABASE_URL=postgresql://postgres:postgres@localhost:54329/coss`, `APP_SECRET`).

```bash
npx prisma migrate deploy --schema apps/api/prisma/schema.prisma   # DB 구조 만들기 (처음·변경 후)
npm run db:seed:demo -w apps/api   # 시연용 가짜 데이터 (선택)
npm run dev:api           # 창 2: API  → http://localhost:3000/api/health
npm run dev:web           # 창 3: 화면 → http://localhost:5173
npm test                  # 자동 테스트 (출석 판정·대리 출석·기기 승인·출결 변경 등)
```

시연 데이터 로그인: 학생 `한국대 / 20231234 / 홍길동`, 인솔자 `한국대 / S2024001 / 김담당` + 학교 코드 `1111`. 개발 모드에서는 총관리자 화면도 `http://localhost:5173/admin`으로 열린다.

### 코드를 고칠 때
- 출석 시간·반경 규칙: `apps/api/src/attendance/rules.ts` 맨 위 숫자
- DB 구조 변경: `schema.prisma` 수정 → `npm run db:migrate:dev -w apps/api -- --name 바꾼내용` → 생긴 `migrations` 폴더도 커밋
- 화면 문구: `apps/web/src/pages/...`
- 고친 뒤 `npm test`와 `npm run build`가 통과하는지 확인
