import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { CryptoModule } from '../../infra/crypto/crypto.module';
import { UsersModule } from '../../users/users.module';
import { AuditModule } from '../audit';
import { AdminMembersController } from './admin-members.controller';
import { AdminRolesController } from './admin-roles.controller';
import { AdminUsersController } from './admin-users.controller';
import { IamService } from './iam.service';
import { MfaController } from './mfa.controller';
import { MfaRepository } from './mfa.repository';
import { MfaService } from './mfa.service';
import { OwnerBootstrapService } from './owner-bootstrap.service';
import { PermissionGuard } from './permission.guard';
import { RolesRepository } from './roles.repository';
import { UserAdminRepository } from './user-admin.repository';
import { UserAdminService } from './user-admin.service';

@Module({
  imports: [DatabaseModule, CryptoModule, AuditModule, UsersModule],
  controllers: [AdminRolesController, AdminMembersController, AdminUsersController, MfaController],
  providers: [
    RolesRepository,
    MfaRepository,
    UserAdminRepository,
    IamService,
    MfaService,
    UserAdminService,
    OwnerBootstrapService,
    PermissionGuard,
  ],
  exports: [IamService, MfaService, OwnerBootstrapService, PermissionGuard],
})
export class IamModule {}
