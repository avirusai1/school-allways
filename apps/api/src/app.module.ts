import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AuditInterceptor } from './common/audit/audit.interceptor';
import { ContextMiddleware } from './common/context/context.middleware';
import { DatabaseModule } from './common/database/database.module';
import { ApiExceptionFilter } from './common/errors/api-exception.filter';
import { StorageModule } from './common/storage/storage.module';
import { IdempotencyInterceptor } from './common/interceptors/idempotency.interceptor';
import { PermissionGuard } from './common/rbac/permission.guard';
import { RbacModule } from './common/rbac/rbac.module';
import { RedisModule } from './common/redis/redis.module';
import { AcademicModule } from './modules/academic/academic.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { AuthModule } from './modules/auth/auth.module';
import { BooksModule } from './modules/books/books.module';
import { CommunicationModule } from './modules/communication/communication.module';
import { ApprovalsModule } from './modules/approvals/approvals.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { ExamsModule } from './modules/exams/exams.module';
import { GrowthModule } from './modules/growth/growth.module';
import { HealthModule } from './modules/health/health.module';
import { HomeworkModule } from './modules/homework/homework.module';
import { ImportModule } from './modules/import/import.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OnboardingModule } from './modules/onboarding/onboarding.module';
import { SettingsModule } from './modules/settings/settings.module';
import { FamilyModule } from './modules/family/family.module';
import { FeesModule } from './modules/fees/fees.module';
import { PlatformModule } from './modules/platform/platform.module';
import { SafetyModule } from './modules/safety/safety.module';
import { StaffModule } from './modules/staff/staff.module';
import { StudentsModule } from './modules/students/students.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { SyncModule } from './modules/sync/sync.module';
import { TransportModule } from './modules/transport/transport.module';
import { validateEnv } from './config/env.validation';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      envFilePath: ['.env', '../../.env'],
    }),
    ThrottlerModule.forRoot([
      // Generous for normal use, tight enough that a runaway client cannot
      // saturate a 2-core box. OTP endpoints override this with their own,
      // much stricter, limit.
      { name: 'default', ttl: 60_000, limit: 120 },
    ]),
    DatabaseModule,
    RedisModule,
    StorageModule,
    RbacModule,
    HealthModule,
    AuthModule,
    StudentsModule,
    AcademicModule,
    StaffModule,
    ImportModule,
    AttendanceModule,
    DashboardModule,
    ApprovalsModule,
    NotificationsModule,
    CommunicationModule,
    HomeworkModule,
    ExamsModule,
    BooksModule,
    SyncModule,
    TransportModule,
    SafetyModule,
    PlatformModule,
    GrowthModule,
    OnboardingModule,
    SettingsModule,
    FamilyModule,
    FeesModule,
    SubscriptionsModule,
  ],
  providers: [
    // Deny by default: every route is guarded unless marked @Public().
    { provide: APP_GUARD, useClass: PermissionGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Must run before guards so the context exists when they populate it.
    consumer.apply(ContextMiddleware).forRoutes('*');
  }
}
