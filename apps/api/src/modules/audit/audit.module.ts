import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { CryptoModule } from '../../infra/crypto/crypto.module';
import { AdminAuditController } from './admin-audit.controller';
import { AuditService } from './audit.service';

@Module({
  imports: [DatabaseModule, CryptoModule],
  controllers: [AdminAuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
