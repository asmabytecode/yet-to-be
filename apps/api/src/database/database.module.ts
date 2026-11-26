import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { AuditLogRepository } from './repositories/audit-log.repository';
import { OAuthAccountsRepository } from './repositories/oauth-accounts.repository';
import { SessionsRepository } from './repositories/sessions.repository';
import { UsersRepository } from './repositories/users.repository';

const repositories = [UsersRepository, OAuthAccountsRepository, SessionsRepository, AuditLogRepository];

@Module({
  providers: [PrismaService, ...repositories],
  exports: [PrismaService, ...repositories],
})
export class DatabaseModule {}
