// 개발 PC용 PostgreSQL을 Docker 없이 켠다 (npm run db:dev).
// 데이터는 apps/api/.dev-db 폴더에 저장되고 저장소에는 올라가지 않는다.
// 끄려면 이 창에서 Ctrl+C.
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(here, '..', '.dev-db');
const port = Number(process.env.DEV_DB_PORT || 54329);

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'postgres',
  password: 'postgres',
  port,
  persistent: true,
  onLog: () => {},
});

if (!existsSync(path.join(dataDir, 'PG_VERSION'))) {
  console.log('처음 실행: DB 폴더를 만듭니다…');
  await pg.initialise();
}
await pg.start();
try {
  await pg.createDatabase('coss');
} catch {
  // 이미 있으면 그대로 사용
}
console.log(`✅ 개발용 DB 실행 중: postgresql://postgres:postgres@localhost:${port}/coss`);
console.log('   끄려면 Ctrl+C');

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
setInterval(() => {}, 1 << 30);
