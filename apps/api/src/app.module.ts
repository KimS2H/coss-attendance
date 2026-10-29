// API 서버의 구성 (어떤 부품을 쓰는지 한곳에 모음)
import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { AdminController } from './admin/admin.controller';
import { SetupController } from './admin/setup.controller';
import { AttendanceService } from './attendance/attendance.service';
import { ChangeRequestsService } from './attendance/change-requests.service';
import { ListingService } from './attendance/listing.service';
import { TicketsService } from './attendance/tickets.service';
import { AuthController } from './auth/auth.controller';
import { MeService } from './auth/me.service';
import { PublicController } from './auth/public.controller';
import { AuthGuard, SessionService } from './auth/session';
import { AuditService } from './common/audit.service';
import { AllExceptionsFilter } from './common/errors';
import { KvService } from './common/kv.service';
import { AdminGateMiddleware, DeviceCookieMiddleware } from './common/middleware';
import { PrismaService } from './common/prisma.service';
import { ImportService } from './excel/import.service';
import { MailService, SettingsService } from './mail/mail.service';
import { StaffController } from './staff/staff.controller';
import { StudentController } from './student/student.controller';

/** API 서버와 Worker가 함께 쓰는 서비스 */
export const SHARED_PROVIDERS = [
  PrismaService,
  KvService,
  AuditService,
  SettingsService,
  MailService,
  AttendanceService,
  ListingService,
  TicketsService,
  ChangeRequestsService,
  ImportService,
];

@Module({
  controllers: [PublicController, AuthController, StudentController, StaffController, SetupController, AdminController],
  providers: [
    ...SHARED_PROVIDERS,
    SessionService,
    MeService,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(DeviceCookieMiddleware).forRoutes({ path: '*path', method: RequestMethod.ALL });
    consumer.apply(AdminGateMiddleware).forRoutes({ path: 'admin/*path', method: RequestMethod.ALL });
  }
}
