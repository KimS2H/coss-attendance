// Worker 시작점 (npm run start:worker): 자동 결석, 10분 우선 거절, 이메일 재발송, 상태 점검, 백업
import 'reflect-metadata';
import { Logger, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { SHARED_PROVIDERS } from './app.module';
import { config, loadDevEnv } from './config';
import { JobsService } from './jobs/jobs.service';

@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [...SHARED_PROVIDERS, JobsService],
})
class WorkerModule {}

async function bootstrap() {
  loadDevEnv();
  config(); // 환경 변수 확인
  const app = await NestFactory.createApplicationContext(WorkerModule, { logger: ['error', 'warn', 'log'] });
  app.enableShutdownHooks();
  new Logger('Worker').log('Worker 실행 중 (1분마다 자동 작업, 매일 03:00 백업)');
}

void bootstrap();
