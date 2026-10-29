// 환경 변수 읽기. 값은 .env 파일(저장소에 올리지 않음)에서 온다.
// 필수 값이 없으면 서버가 켜지지 않고 무엇이 빠졌는지 알려 준다.
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['production', 'development', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL이 필요해요'),
  REDIS_URL: z.string().optional().default(''), // 비우면 메모리 저장 (개발·테스트용)
  APP_SECRET: z.string().min(32, 'APP_SECRET은 32자 이상이어야 해요 (.env.example 참고)'),
  ADMIN_GATE_SECRET: z.string().optional().default(''),
  PUBLIC_URL: z.string().optional().default(''),
  BACKUP_DIR: z.string().optional().default('/backups'),
});

export type AppConfig = z.infer<typeof schema>;

let cached: AppConfig | null = null;

export function config(): AppConfig {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `- ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`환경 변수 설정이 잘못됐어요 (.env 확인):\n${msg}`);
  }
  cached = parsed.data;
  return cached;
}

/** 개발 PC: apps/api/.env 파일을 읽는다 (서버 PC는 Docker가 환경 변수를 넣어 주므로 파일이 없음) */
export function loadDevEnv() {
  try {
    process.loadEnvFile('.env');
  } catch {
    // .env가 없으면 그대로 진행
  }
}

export const isProd = () => config().NODE_ENV === 'production';

/** 테스트에서 환경 변수를 바꾼 뒤 다시 읽게 할 때 */
export function resetConfigCache() {
  cached = null;
}
