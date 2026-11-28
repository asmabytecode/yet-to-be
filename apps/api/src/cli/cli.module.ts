import { Module } from '@nestjs/common';
import { AppConfigModule } from '../config/app-config.module';
import { DatabaseModule } from '../database/database.module';
import { CryptoModule } from '../infra/crypto/crypto.module';
import { AuditModule } from '../modules/audit';
import { IamModule } from '../modules/iam';
import { PlatformModule } from '../platform/platform.module';

/** Мінімальний контекст для серверних команд: без HTTP, guards і логера запитів. */
@Module({
  imports: [AppConfigModule, PlatformModule, DatabaseModule, CryptoModule, AuditModule, IamModule],
})
export class CliModule {}
