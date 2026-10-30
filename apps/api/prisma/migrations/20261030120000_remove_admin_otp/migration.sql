-- 총관리자 OTP 제거 (2026-10-30 사용자 결정). 관리자 화면은 Tailscale 기기 + 아이디·비밀번호로 지킨다.
ALTER TABLE "admins" DROP COLUMN "otp_secret_enc",
DROP COLUMN "otp_verified";
