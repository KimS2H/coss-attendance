// API 서버 시작점 (npm run dev / npm start)
import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { config, loadDevEnv } from './config';

export async function createApp() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: ['error', 'warn', 'log'] });
  app.setGlobalPrefix('api');
  app.set('trust proxy', 1); // Nginx 뒤에서 실제 접속 IP를 읽기 위해
  app.use(helmet());
  app.use(cookieParser());
  app.useBodyParser('json', { limit: '200kb' });
  app.enableShutdownHooks();
  return app;
}

async function bootstrap() {
  loadDevEnv();
  const cfg = config();
  const app = await createApp();
  await app.listen(cfg.PORT, '0.0.0.0');
  new Logger('Main').log(`API 서버 실행 중: http://localhost:${cfg.PORT}/api (모드: ${cfg.NODE_ENV})`);
}

if (require.main === module) void bootstrap();
