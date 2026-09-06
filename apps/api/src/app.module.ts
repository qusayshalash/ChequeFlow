import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { CryptoModule } from './common/crypto/crypto.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { AppConfigModule } from './config/config.module';
import { AppConfigService } from './config/app-config.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { BackupModule } from './modules/backup/backup.module';
import { ChequeImagesModule } from './modules/cheque-images/cheque-images.module';
import { ChequesModule } from './modules/cheques/cheques.module';
import { ContactsModule } from './modules/contacts/contacts.module';
import { DiagnosticsModule } from './modules/diagnostics/diagnostics.module';
import { HealthModule } from './modules/health/health.module';
import { OcrModule } from './modules/ocr/ocr.module';
import { ReferenceModule } from './modules/reference/reference.module';
import { RemindersModule } from './modules/reminders/reminders.module';
import { ReportsModule } from './modules/reports/reports.module';
import { StorageModule } from './modules/storage/storage.module';
import { UsersModule } from './modules/users/users.module';

/**
 * Guard order matters and is enforced here globally:
 *   1. ThrottlerGuard  — cheap rejection of abusive traffic;
 *   2. JwtAuthGuard    — resolves the session (and the organization);
 *   3. PermissionsGuard — checks the route's declared permissions.
 */
@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    CryptoModule,
    AuditModule,
    StorageModule,
    /**
     * One limit applies everywhere; the named ones are opened per route.
     *
     * Every registered throttler is evaluated on every request, and the
     * strictest one wins — so registering `ocr` at 20 a minute did not limit
     * OCR, it limited *the whole API* to 20 a minute. Raising
     * RATE_LIMIT_DEFAULT_PER_MINUTE to 100000 still left a 20-request ceiling
     * on the contact list, and nothing said why.
     *
     * So the three special buckets are registered effectively open and the
     * real number is supplied by the `@Throttle` on the one route each is for,
     * where it applies to that route alone. `default` stays the only limit
     * that governs everything.
     */
    ThrottlerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        throttlers: [
          { name: 'default', ttl: 60_000, limit: config.rateLimits.default },
          { name: 'auth', ttl: 60_000, limit: Number.MAX_SAFE_INTEGER },
          { name: 'upload', ttl: 60_000, limit: Number.MAX_SAFE_INTEGER },
          { name: 'ocr', ttl: 60_000, limit: Number.MAX_SAFE_INTEGER },
        ],
      }),
    }),
    AuthModule,
    ContactsModule,
    ChequesModule,
    ChequeImagesModule,
    OcrModule,
    ReferenceModule,
    ReportsModule,
    RemindersModule,
    UsersModule,
    DiagnosticsModule,
    BackupModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
