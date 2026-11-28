import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AuthModule } from './auth/auth.module';
import { CsrfGuard } from './auth/csrf.guard';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { buildLoggerParams } from './common/logging';
import { AppConfigModule } from './config/app-config.module';
import { AppConfigService } from './config/app-config.service';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { CryptoModule } from './infra/crypto/crypto.module';
import { AuditModule } from './modules/audit';
import { EventsModule } from './modules/events';
import { IamModule, PermissionGuard } from './modules/iam';
import { MediaModule } from './modules/media';
import { PlatformModule } from './platform/platform.module';

/**
 * Порядок глобальних guards важливий: спочатку rate limit (дешево відсікає флуд),
 * потім CSRF, потім автентифікація, потім права (RBAC, Етап 14).
 */
@Module({
  imports: [
    AppConfigModule,
    LoggerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => buildLoggerParams(config),
    }),
    ThrottlerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        throttlers: [{ ttl: 60_000, limit: 100 }],
        skipIf: () => config.app.throttleDisabled,
      }),
    }),
    PlatformModule,
    DatabaseModule,
    CryptoModule,
    AuditModule,
    IamModule,
    MediaModule,
    EventsModule,
    AuthModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
  ],
})
export class AppModule {}
