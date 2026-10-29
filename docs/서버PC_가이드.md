# 서버 PC 가이드

> 출석체크 서버로 쓸 사무실 PC를 고르고, 설치하고, 운영하는 방법. 컴퓨터에 익숙하지 않아도 위에서부터 차례로 따라 하면 된다.
> 마지막 갱신: 2026-10-29 · 관련 문서: [README](../README.md) · [시스템 구성](architecture.md) · [진행 상황](진행상황.md)

## 0. 한눈에 보기

- 서버 PC 한 대가 학생·인솔자·총관리자 화면과 데이터를 모두 맡는다. **켜져 있어야 출석이 된다.**
- 프로그램은 모두 Docker 안에서 돌아간다. 서버 PC에 Node.js, PostgreSQL 같은 것을 따로 설치하지 않는다.
- 인터넷 공개는 Tailscale Funnel이 맡는다. 공유기 포트를 열거나 도메인을 살 필요가 없다.
- 준비 시간: PC가 있으면 약 2시간 (Windows 업데이트·재부팅 시간 포함).

```
학생·인솔자 폰 ─(인터넷, HTTPS)→ Tailscale Funnel → [서버 PC] Nginx 8080 → API → DB
총관리자 PC   ─(Tailscale 사설망)→ Tailscale Serve  → [서버 PC] Nginx 8081 → API → DB
```

---

## 1. PC 사양

### 1-1. 최소 사양과 권장 사양

| 항목 | 최소 | 권장 | 이유 |
|---|---|---|---|
| CPU | 64비트 4코어 (Intel Core i5 8세대 / AMD Ryzen 5 2000 이상) | 6코어 이상 | Docker(WSL 2)와 컨테이너 5개. 학생 50명이 동시에 출석해도 부담은 작다 |
| **가상화 기능** | **반드시 지원·켜짐** (Intel VT-x / AMD-V) | — | 없으면 Docker가 동작하지 않는다 (확인 방법: 아래 1-3) |
| 메모리(RAM) | 8GB | 16GB | Windows 약 3GB + Docker Desktop·WSL 약 2GB + 컨테이너 약 1GB |
| 저장장치 | SSD, 여유 공간 64GB 이상 | SSD 256GB 이상 | Docker 프로그램·이미지 약 10GB. 출석 데이터는 1GB 미만, 백업 7일치 수십 MB |
| 운영체제 | Windows 10 22H2 (64비트) | **Windows 11 23H2 이상** (Home·Pro 모두 가능) | Docker Desktop 요구 사항 |
| 네트워크 | 인터넷 상시 연결, 속도 10Mbps 이상 | **유선 LAN**, 100Mbps | 출석 요청은 매우 작다. 유선이 끊김이 적다 |
| 전원 | 절전 모드 끄기 | **UPS(무정전 전원장치)** 10분 이상 | 정전·순간 정전 때 DB 손상 방지 |
| 모니터·키보드 | 처음 설치할 때만 필요 | — | 설치 후에는 없어도 되지만 문제 해결 때 있으면 편하다 |

### 1-2. PC를 고를 때 주의할 점

- **노트북도 되지만** 덮개를 닫아도 꺼지지 않게 설정하고, 전원 어댑터를 항상 꽂아 둔다. 배터리가 부풀 수 있으니 오래 쓸 거라면 데스크톱이 낫다.
- **다른 업무에 쓰지 않는 PC**가 좋다. 누가 끄거나 재시작하면 출석이 멈춘다.
- **24시간 켜 둔다.** 새벽 3시에 자동 백업을 하고, 수업이 끝나면 자동으로 결석 처리를 한다.
- 학교 네트워크 사용은 허용받았다(2026-10-28). 학교 보안 프로그램이 Tailscale을 막지 않는지만 확인한다.

### 1-3. 지금 PC가 되는지 확인하는 방법

1. `Win + Pause` (또는 설정 → 시스템 → 정보): 프로세서, 설치된 RAM, 시스템 종류(64비트), Windows 버전 확인
2. 작업 관리자(`Ctrl + Shift + Esc`) → 성능 → CPU → 오른쪽 아래 **"가상화: 사용"** 이어야 한다.
   - "사용 안 함"이면 PC를 켤 때 BIOS(보통 `F2`·`Del` 키)에 들어가 `Intel Virtualization Technology` 또는 `SVM Mode`를 켠다. 모르면 PC 제조사 고객센터에 "가상화 켜는 법"을 문의한다.
3. 파일 탐색기 → 내 PC → C 드라이브 여유 공간 64GB 이상

---

## 2. 필요한 소프트웨어

### 2-1. 서버 PC에 설치하는 것

| 소프트웨어 | 버전 | 용도 | 설치 |
|---|---|---|---|
| Windows | 11 23H2 이상 권장 (10 22H2 가능), 최신 업데이트 | 운영체제 | 설정 → Windows 업데이트 |
| WSL 2 (리눅스용 Windows 하위 시스템) | 최신 | Docker가 쓰는 리눅스 환경 | `wsl --install` (아래 3-2) |
| Docker Desktop | 최신 (검증: Docker Engine 29.9, Compose 5.6) | 프로그램 실행 | `winget install --id Docker.DockerDesktop -e` |
| Git for Windows | 2.40 이상 (검증: 2.56) | 코드 받기·업데이트 | `winget install --id Git.Git -e` |
| Tailscale | 최신 | 인터넷 공개(Funnel)와 관리자 전용 통로(Serve) | https://tailscale.com/download |
| 웹 브라우저 | Chrome 또는 Edge 최신 | 관리자 화면 확인 | 기본 설치된 Edge 사용 가능 |

- Docker Desktop은 교육·비영리 용도는 무료지만, 학교(기관) 명의로 쓰면 학교 규정을 한 번 확인한다.

### 2-2. 설치하지 않아도 되는 것 (Docker 안에 들어 있음)

| 프로그램 | 버전 | 비고 |
|---|---|---|
| PostgreSQL (DB) | 16 | `postgres:16-alpine` 이미지 |
| Redis (로그인 세션) | 7 | `redis:7-alpine` |
| Node.js (API 실행) | 22 | `node:22-bookworm-slim` |
| Nginx (입구) | 1.27 | `nginx:1.27-alpine` |
| pg_dump (백업) | 16 | Worker 이미지에 포함 |

처음 실행할 때 인터넷에서 자동으로 받는다 (약 1~2GB).

### 2-3. 필요한 계정과 기기

| 계정·기기 | 용도 | 비용 |
|---|---|---|
| Tailscale 계정 | 서버 PC와 총관리자 PC를 같은 사설망에 묶음. Funnel로 공개 주소 발급 | 무료 (Personal: 사용자 3명, 기기 100대) |
| 총관리자 PC의 Tailscale | 관리자 화면은 Tailscale에 로그인한 PC에서만 열린다 | 무료 |
| Gmail 계정 + 앱 비밀번호 | 알림 메일 발송 (2단계 인증을 켜야 앱 비밀번호를 만들 수 있음) | 무료 |
| 총관리자 휴대폰의 OTP 앱 | 관리자 로그인 (Google Authenticator, Microsoft Authenticator 등) | 무료 |
| UptimeRobot 계정 (선택) | 서버가 꺼지면 이메일로 알림 | 무료 |
| GitHub 계정 | 필요 없음 (공개 저장소라 누구나 받을 수 있음) | — |

---

## 3. 설치 순서

> 명령은 **PowerShell**에서 실행한다 (시작 → "PowerShell" 검색). "관리자"라고 적힌 곳만 PowerShell을 마우스 오른쪽 버튼 → **관리자 권한으로 실행**한다.

### 3-0. 출발 전 준비 (현장에서 바로 할 수 있게)

**미리 확인 (담당자에게 전화·메신저로 물어봐도 됨)**
- [ ] 서버로 쓸 PC가 1장 사양을 만족하는지, 특히 **가상화: 사용** (1-3)
- [ ] 그 PC의 Windows 계정 비밀번호 (관리자 권한이 있는 계정)
- [ ] 유선 LAN을 꽂을 수 있는지, 학교 네트워크에서 `github.com`, `docker.com`, `tailscale.com`이 열리는지

**미리 만들어 둘 것 (내 휴대폰·PC로)**
- [ ] Tailscale 계정 (https://login.tailscale.com, Google 계정으로 가입 가능)
- [ ] 알림용 Gmail의 2단계 인증 켜기 → **앱 비밀번호** 만들어 메모 (Google 계정 → 보안 → 2단계 인증 → 앱 비밀번호)
- [ ] 총관리자 휴대폰에 OTP 앱 설치 (Google Authenticator 등)

**가져갈 것**
- [ ] 휴대폰 2대 이상 (그중 1대는 LTE로 접속 시험용)
- [ ] 노트북 1대: 총관리자 PC로 쓸 것. 미리 Tailscale을 설치·로그인해 두면 좋다. 인솔자 화면(강의실 코드 띄우기) 시험에도 쓴다
- [ ] USB: 만든 `.env`를 사본으로 보관할 곳
- [ ] 실제 데이터 엑셀 (있으면): 학교, 인솔자(이메일 포함), 장소, 수업 일정, 학생 명단
- [ ] 이 가이드 주소: https://github.com/KimS2H/coss-attendance/blob/main/docs/서버PC_가이드.md

**시간:** 설치 1~2시간 + 시험 30분. Windows 업데이트가 오래 걸릴 수 있으니 가능하면 전날 미리 해 둔다.

**코드 받기:** 공개 저장소라 **GitHub 계정·로그인 없이** `git clone`으로 받을 수 있다 (3-3). Git을 설치할 수 없는 상황이면 저장소 페이지의 `Code → Download ZIP`으로 받아 `C:\coss-attendance`에 풀어도 되지만, 나중에 새 버전으로 바꾸기(`git pull`)가 어려우므로 Git을 권한다.

### 3-1. Windows 기본 설정

1. **Windows 업데이트**를 끝까지 하고 재부팅한다.
2. **시간 자동 동기화 켜기:** 설정 → 시간 및 언어 → 날짜 및 시간 → "자동으로 시간 설정" 켜기, 표준 시간대 "(UTC+09:00) 서울". 출석·지각은 **서버 시각**으로 판정하므로 매우 중요하다.
3. **절전 끄기** (관리자 PowerShell):
   ```powershell
   powercfg /change standby-timeout-ac 0
   ```
   ```powershell
   powercfg /change hibernate-timeout-ac 0
   ```
   노트북이면 제어판 → 전원 옵션 → "덮개를 닫으면" → **아무 것도 안 함**(전원 연결 시).
4. **업데이트 재시작 시간 정하기:** 설정 → Windows 업데이트 → 고급 옵션 → 사용 시간 → 수동, 07:00 ~ 23:00. 업데이트 재시작이 새벽에만 일어난다.
5. **자동 로그인** (재부팅 후 Docker가 저절로 켜지게): `Win + R` → `netplwiz` → "사용자 이름과 암호를 입력해야 이 컴퓨터를 사용할 수 있음" 체크 해제 → 암호 입력.
   - 이 메뉴가 안 보이면 설정 → 계정 → 로그인 옵션 → "보안 향상을 위해 Windows Hello 로그인만 허용" 끄기 후 다시 시도.
   - 자동 로그인을 쓰면 PC 앞에 앉은 사람은 누구나 쓸 수 있으므로, 서버 PC는 잠긴 공간에 두거나 화면 보호기 잠금을 켠다.

### 3-2. WSL 2와 Docker Desktop

1. **WSL 2 설치** (관리자 PowerShell) → 끝나면 재부팅:
   ```powershell
   wsl --install
   ```
2. **Docker Desktop 설치**:
   ```powershell
   winget install --id Docker.DockerDesktop -e
   ```
   설치 화면에서 "Use WSL 2 instead of Hyper-V"를 선택한다.
3. Docker Desktop을 실행해 약관에 동의한다 (로그인은 하지 않아도 된다).
4. Docker Desktop 설정(톱니바퀴) → General → **"Start Docker Desktop when you sign in to your computer"** 켜기.
5. 새 PowerShell 창에서 확인 (버전이 나오면 성공):
   ```powershell
   docker version
   ```
   ```powershell
   docker compose version
   ```

### 3-3. Git과 코드 받기

```powershell
winget install --id Git.Git -e
```

새 PowerShell 창을 열고:

```powershell
git clone https://github.com/KimS2H/coss-attendance.git C:\coss-attendance
```
```powershell
cd C:\coss-attendance
```

### 3-4. 비밀 값 파일(.env) 만들기

```powershell
powershell -ExecutionPolicy Bypass -File scripts\make-env.ps1
```

- 공개 주소를 묻는데, 아직 모르면 Enter를 누른다 (3-6에서 알게 된다).
- 만들어진 `C:\coss-attendance\.env` 파일을 **USB 등 안전한 곳에 복사해 둔다.** 잃어버리면 이메일 설정과 OTP를 다시 해야 한다.
- 이 파일은 저장소에 올라가지 않는다. 메신저·이메일로 보내지 않는다.

### 3-5. 출석체크 켜기

```powershell
docker compose up -d --build
```

처음에는 5~10분 걸린다. 끝나면 상태를 확인한다:

```powershell
docker compose ps
```

`api`가 `healthy`, 나머지가 `running`이면 성공이다. 브라우저에서 http://127.0.0.1:8080 을 열면 로그인 화면이 보인다.

### 3-6. 인터넷에 공개하기 (Tailscale)

1. Tailscale을 설치하고 로그인한다 (https://tailscale.com/download).
2. 브라우저에서 Tailscale 관리 콘솔(https://login.tailscale.com/admin) → **DNS** 탭 → **MagicDNS** 켜기, **HTTPS Certificates** 켜기.
3. 공개 입구 열기 (학생·인솔자용, PowerShell):
   ```powershell
   tailscale funnel --bg 8080
   ```
   처음이면 "Funnel을 켜려면 이 링크를 여세요"라는 안내가 나온다. 링크를 열어 허용한 뒤 명령을 다시 실행한다.
4. 관리자 입구 열기 (Tailscale에 로그인한 PC만 접속 가능):
   ```powershell
   tailscale serve --bg --https=8443 http://127.0.0.1:8081
   ```
5. 주소 확인:
   ```powershell
   tailscale funnel status
   ```
   - 공개 주소: `https://<PC이름>.<tailnet이름>.ts.net` → 학생·인솔자에게 QR 코드로 안내
   - 관리자 주소: `https://<PC이름>.<tailnet이름>.ts.net:8443/admin`
   - `--bg` 덕분에 재부팅해도 다시 켜진다.
6. `.env`의 `PUBLIC_URL=`에 공개 주소를 적고 `docker compose up -d`를 한 번 더 실행한다.
7. **총관리자 PC**에도 Tailscale을 설치하고 **같은 계정**으로 로그인한다 (다른 사람이면 관리 콘솔에서 초대).

> 실제 공개 주소는 문서·코드·채팅방에 적지 말고 `.env`와 안내문(QR)에만 쓴다.

### 3-7. 첫 설정 (총관리자, 한 번만)

1. 총관리자 PC에서 `https://<PC이름>.<tailnet이름>.ts.net:8443/admin` 접속
2. 총관리자 아이디·비밀번호(12자 이상) 만들기
3. 휴대폰 OTP 앱으로 QR 찍고 6자리 입력
4. 이메일 발송 계정 입력: SMTP 서버 `smtp.gmail.com`, 포트 `587`, Gmail 주소, **앱 비밀번호**(Google 계정 → 보안 → 2단계 인증 → 앱 비밀번호), 테스트 메일 받을 주소 → 테스트 메일이 도착하면 저장
5. "설정 완료"

### 3-8. 현장 시험 (실제 데이터를 넣기 전에)

시험용 데이터로 전체 흐름을 확인하고, **끝나면 DB를 비운다**(3-8-3). 실제 데이터는 그다음에 넣는다(3-9). 준비물: 휴대폰 A·B, 노트북 1대.

#### 3-8-1. 시험 데이터 만들기

1. **총관리자** (노트북, `https://<공개 주소>:8443/admin`):
   - 계정·학교 코드 → 학교 `시험대학` 추가 → 학교 코드 `9999`
   - 계정·학교 코드 → 인솔자 추가: 시험대학 / 직번 `T1` / 이름: 내 이름 / 이메일: 내 이메일 / 권한: 수정
   - 장소·일정 → 장소 추가: **지금 있는 강의실**의 좌표 (그 자리에서 휴대폰 지도 앱으로 현재 위치를 길게 눌러 복사), 반경 50
   - 장소·일정 → 수업 추가: 과목 `시험 수업 1`, 오늘 날짜, 1교시, **시작 = 지금부터 2~3분 뒤**, 종료 = 1시간 뒤, 위 장소
   - 같은 방법으로 `시험 수업 2` (2교시, 시간은 같게)
2. **인솔자** (노트북의 다른 브라우저 창, 공개 주소 → "담당자" 탭): 시험대학 / `T1` / 내 이름 → 학교 코드 `9999`
   - 학생·수강 관리 → 학생 2명 추가: `T0001` 시험학생일, `T0002` 시험학생이 (단과대·학과는 아무 값)
   - "전체 학생 수강 등록" 누르기
   - 출석 현황 → 수업 `시험 수업 1` 선택 → **강의실 코드 띄우기**

#### 3-8-2. 시험 순서와 기대 결과

| # | 기기 | 할 일 | 기대 결과 |
|---|---|---|---|
| 1 | 휴대폰 A (**Wi-Fi 끄고 LTE**) | 공개 주소 접속 → 학생 `T0001` 시험학생일 로그인 → 동의 | 출석 메인 화면, 상단에 로고·"문의" 버튼 |
| 2 | 휴대폰 A | "미출" 누르기 → 위치 허용 → 노트북 화면의 코드 4자리 입력 | **"출석"** (시작 5분 후가 지났으면 "지각"도 정상) |
| 3 | 휴대폰 B (**학교 Wi-Fi**) | 학생 `T0002` 시험학생이 로그인 → 동의 (출석은 아직 안 함) | 출석 메인 화면 (학교 Wi-Fi 접속 확인) |
| 4 | 휴대폰 A | 로그아웃 → `T0002` 시험학생이로 로그인 → 시험 수업 1 출석 | **"출석 취소"** + 대리 출석 경고 (기기 주인 시험학생일은 유지) |
| 5 | 노트북 (인솔자) | 출석 현황 새로고침 | 시험학생일 출석, 시험학생이 출석 취소·동일기기 의심 표시 |
| 6 | 휴대폰 B | 로그아웃 → `T0001` 시험학생일로 로그인 → **시험 수업 2** 출석 | **"승인 대기"** (다른 학생의 등록 기기) + 인솔자에게 메일 |
| 7 | 노트북 (인솔자) | 기기 승인 → 승인 | "승인했어요 …" → 휴대폰 B 새로고침 시 "출석" |
| 8 | 휴대폰 A 또는 B | 일부러 틀린 코드 입력 / 건물 밖에서 시도 | "코드가 맞지 않아요" / "출석 장소에서 멀어요 (약 ○○m)" |
| 9 | 아무 휴대폰 | 학생 화면 "문의" → 문의 보내기 | 인솔자 이메일 도착, 인솔자 문의함에 표시 |
| 10 | 노트북 (인솔자) | 출석 현황 → 엑셀 다운로드 | 엑셀 파일이 열리고 한글이 깨지지 않음 |
| 11 | Tailscale을 **안 켠** 휴대폰 | `https://<공개 주소>:8443/admin` 접속 | **열리지 않아야 정상** |
| 12 | 서버 PC | **재부팅** → 5분 뒤 휴대폰으로 공개 주소 접속 | 로그인 화면이 열림 (`docker compose ps` 모두 정상) |
| 13 | 인솔자들 휴대폰 여러 대 | 동시에 로그인·출석 | 3초 안에 결과가 나옴 |

- 위치 판정이 자주 실패하면 장소의 허용 반경을 늘리거나(장소·일정 화면), 좌표를 강의실 한가운데에서 다시 잡는다.
- 하나라도 기대와 다르면 화면을 사진으로 찍고 `docker compose logs api --tail 100`의 결과를 저장해 둔다.

#### 3-8-3. 시험 데이터 지우기 (DB 초기화)

시험 데이터가 실제 출석 통계에 섞이지 않도록 DB를 처음 상태로 돌린다. **실제 데이터를 넣은 뒤에는 절대 하지 않는다.**

```powershell
cd C:\coss-attendance
```
```powershell
docker compose down
```
```powershell
Remove-Item -Recurse -Force .\data\postgres
```
```powershell
docker compose up -d
```

- 1~2분 뒤 `docker compose ps`가 정상이면, 총관리자 주소에서 **첫 설정(3-7)을 다시** 한다. OTP 앱에 있던 이전 항목은 지우고 새 QR을 찍는다.
- 휴대폰에 남은 시험 로그인은 로그아웃하면 된다. 학생이 실제로 쓸 폰이 아니면 신경 쓰지 않아도 된다.

### 3-9. 데이터 넣기 (총관리자 화면)

순서가 중요하다: **학교 → 학교 코드 → 인솔자 → 장소 → 수업 일정 → 학생·수강**

1. 계정·학교 코드: 학교 4~5곳 등록, 학교별 코드 4자리 정하기 → 인솔자에게 직접 알림
2. 엑셀 등록: 각 종류의 "템플릿 받기" → 채워서 올리기 → 미리보기에서 빨간 오류가 없으면 "확정"
3. 모든 학생이 모든 수업을 들으면, 인솔자 화면 → 학생·수강 관리 → "전체 학생 수강 등록"으로 수강 시트를 대신할 수 있다

### 3-10. 마무리 점검 (첫 수업 전)

- [ ] 학교 Wi-Fi와 LTE(휴대폰 데이터) 양쪽에서 공개 주소가 열리는가
- [ ] 휴대폰 여러 대로 동시에 출석해도 3초 안에 결과가 나오는가
- [ ] **PC를 재부팅**한 뒤 5분 안에 `docker compose ps`가 모두 정상이고 공개 주소가 열리는가
- [ ] 관리자 주소가 Tailscale을 끈 기기에서는 **열리지 않는가**
- [ ] 테스트 메일·기기 승인 요청 메일이 인솔자에게 도착하는가
- [ ] UptimeRobot에 `https://<공개 주소>/api/health`를 5분 간격으로 등록했는가
- [ ] `.env`를 안전한 곳에 복사해 두었는가

---

## 4. 운영

### 4-1. 정기 점검

| 주기 | 할 일 |
|---|---|
| 수업 있는 날 아침 | 공개 주소가 열리는지 휴대폰으로 확인, 총관리자 대시보드의 "시스템 상태" 확인 |
| 매주 | `C:\coss-attendance\backups` 폴더를 외장 디스크나 Google Drive에 복사 (클라우드 자동 복사는 아직 없음) |
| 매주 | 디스크 여유 공간 확인 (85%를 넘으면 총관리자에게 경고 메일이 간다) |
| 매달 | Windows·Docker Desktop·Tailscale 업데이트 (수업이 없는 날에) |

### 4-2. 자주 쓰는 명령 (`C:\coss-attendance`에서)

| 하고 싶은 일 | 명령 |
|---|---|
| 상태 보기 | `docker compose ps` |
| 로그 보기 (Ctrl+C로 나가기) | `docker compose logs -f api` · `docker compose logs -f worker` |
| 껐다 켜기 | `docker compose restart` |
| 새 버전으로 바꾸기 | `git pull` 후 `docker compose up -d --build` |
| 끄기 (데이터는 남음) | `docker compose down` |
| 공개 주소 상태 | `tailscale funnel status` |

### 4-3. 데이터가 저장되는 곳

| 폴더·파일 | 내용 | 주의 |
|---|---|---|
| `C:\coss-attendance\data\postgres` | 학생·출석 등 모든 데이터 | 절대 지우지 않는다. `docker compose down`을 해도 남는다 |
| `C:\coss-attendance\backups` | 매일 03:00 백업 (7일 보관) | 주 1회 다른 곳에 복사 |
| `C:\coss-attendance\.env` | 비밀 값 | 안전한 곳에 사본 보관, 공유 금지 |

PC를 바꿀 때는 이 세 가지를 새 PC의 같은 위치로 옮기고 3-2 ~ 3-6을 다시 한다.

---

## 5. 문제 해결

| 증상 | 확인할 것 |
|---|---|
| 학생이 주소에 접속이 안 됨 | ① 서버 PC가 켜져 있는가 ② `docker compose ps`가 정상인가 ③ `tailscale funnel status`에 8080이 보이는가 ④ 인터넷 연결 |
| 관리자 화면이 안 열림 | 총관리자 PC의 Tailscale이 켜져 있고 같은 계정인가. 주소 끝에 `:8443/admin`을 붙였는가 |
| `docker` 명령을 찾을 수 없음 | Docker Desktop이 실행 중인가 (작업 표시줄 고래 아이콘). PowerShell을 새로 열었는가 |
| `api`가 healthy가 안 됨 | `docker compose logs api`에서 "환경 변수 설정이 잘못됐어요"가 보이면 `.env` 확인 |
| 재부팅 후 안 켜짐 | 자동 로그인(3-1-5)과 Docker Desktop 자동 시작(3-2-4)이 켜져 있는가 |
| 메일이 안 옴 | 총관리자 화면 → 설정에서 테스트 메일. Gmail 앱 비밀번호가 바뀌었으면 새로 입력 |
| 출석 시각이 이상함 | Windows 시간 자동 동기화(3-1-2). 바꾼 뒤 `docker compose restart` |
| 디스크가 가득 참 | Docker Desktop → Images에서 안 쓰는 이미지 삭제, `backups` 오래된 파일을 다른 곳으로 옮기기 |
| 백업에서 되살려야 함 | [README](../README.md) "백업에서 되살리기". 실제 데이터를 덮어쓰므로 먼저 현재 상태도 백업 |

## 6. 보안 주의

- 서버 PC의 Windows 계정에 **강한 비밀번호**를 쓰고, 다른 사람과 계정을 같이 쓰지 않는다.
- 원격 데스크톱·원격 지원 프로그램(팀뷰어 등)은 꼭 필요할 때만 켠다. 원격 관리는 Tailscale에 등록된 PC에서만 한다.
- Windows 보안(백신)과 방화벽은 켜 둔다. Docker는 `127.0.0.1`에만 열려 있어 같은 네트워크의 다른 PC도 직접 들어올 수 없다.
- `.env`, `data`, `backups` 폴더는 USB·클라우드에 복사할 때도 다른 사람이 볼 수 없는 곳에 둔다 (학생 개인정보).
- 프로그램 종료 1년 뒤 개인정보를 파기한다 (사업 규정).
