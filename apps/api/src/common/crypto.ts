// 암호화·해시 도우미. 모두 .env의 APP_SECRET을 열쇠로 쓴다.
//  - hmac: 되돌릴 수 없는 해시 (학교 코드, 기기 쿠키). DB가 새도 원래 값을 알 수 없다.
//  - encrypt/decrypt: 되돌릴 수 있는 암호화 (이메일 비밀번호).
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { config } from '../config';

const key = () => createHash('sha256').update(config().APP_SECRET).digest(); // 32바이트 열쇠

export function hmac(purpose: string, value: string): string {
  return createHmac('sha256', config().APP_SECRET).update(`${purpose}:${value}`).digest('hex');
}

/** 두 문자열을 같은 시간 안에 비교 (비밀 값 비교용) */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64'), tag.toString('base64'), data.toString('base64')].join(':');
}

export function decrypt(enc: string): string {
  const [v, iv, tag, data] = enc.split(':');
  if (v !== 'v1') throw new Error('알 수 없는 암호문 형식');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** 학교 코드(4자리) 해시 */
export const hashSchoolCode = (code: string) => hmac('school-code', code);
/** 기기 쿠키(did) 해시 → devices.fingerprint_hash */
export const hashDevice = (did: string) => hmac('device', did);
