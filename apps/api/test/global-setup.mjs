// 테스트 시작 전: 빈 PostgreSQL을 임시 폴더에 켜고 DB 구조(마이그레이션)를 만든다.
import EmbeddedPostgres from 'embedded-postgres';
import { execSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = 54331;
const here = path.dirname(fileURLToPath(import.meta.url));

export default async function globalSetup() {
  const dir = mkdtempSync(path.join(tmpdir(), 'coss-test-db-'));
  const pg = new EmbeddedPostgres({ databaseDir: dir, user: 'postgres', password: 'postgres', port: PORT, persistent: false, onLog: () => {} });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('coss_test');
  const url = `postgresql://postgres:postgres@localhost:${PORT}/coss_test`;
  process.env.DATABASE_URL = url;
  execSync('npx prisma migrate deploy', { cwd: path.join(here, '..'), env: { ...process.env, DATABASE_URL: url }, stdio: 'ignore' });
  globalThis.__PG__ = pg;
}
