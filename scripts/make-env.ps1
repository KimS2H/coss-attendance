# ─────────────────────────────────────────────
# 서버 PC용 .env 파일을 만든다 (비밀 값 3개를 무작위로 생성).
# 사용법 (저장소 폴더에서):  powershell -ExecutionPolicy Bypass -File scripts\make-env.ps1
# 이미 .env가 있으면 덮어쓰지 않는다 (덮어쓰면 저장된 이메일 비밀번호·OTP를 못 읽게 됨).
# 만든 .env는 USB 등 안전한 곳에 따로 보관한다. 저장소에는 올라가지 않는다(.gitignore).
# ─────────────────────────────────────────────
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $root '.env'

if (Test-Path $envPath) {
  Write-Host '이미 .env 파일이 있어요. 덮어쓰지 않고 끝냅니다.' -ForegroundColor Yellow
  Write-Host '새로 만들려면 기존 .env를 다른 곳에 백업한 뒤 지우고 다시 실행하세요.'
  exit 1
}

# 안전한 무작위 값 (URL에 넣어도 되는 문자만)
function New-Secret([int]$bytes) {
  $b = New-Object byte[] $bytes
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
  return [Convert]::ToBase64String($b).Replace('+', '-').Replace('/', '_').TrimEnd('=')
}

$publicUrl = Read-Host '공개 주소를 입력하세요 (예: https://office-pc.tail1234.ts.net, 모르면 Enter)'

$content = @"
# 서버 PC 비밀 값 ($(Get-Date -Format 'yyyy-MM-dd') 생성). 절대 공유·업로드하지 말 것.
NODE_ENV=production
APP_SECRET=$(New-Secret 36)
ADMIN_GATE_SECRET=$(New-Secret 24)
POSTGRES_PASSWORD=$(New-Secret 24)
PUBLIC_URL=$publicUrl
"@

# BOM 없는 UTF-8로 저장 (BOM이 있으면 Docker가 첫 줄을 잘못 읽음)
[IO.File]::WriteAllText($envPath, $content.Replace("`r`n", "`n") + "`n", (New-Object Text.UTF8Encoding $false))
Write-Host ".env를 만들었어요: $envPath" -ForegroundColor Green
Write-Host '이 파일을 USB 등 안전한 곳에 복사해 두세요. 잃어버리면 이메일 설정과 OTP를 다시 해야 해요.'
