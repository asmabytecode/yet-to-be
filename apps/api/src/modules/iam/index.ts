// Публічний API модуля iam. Інші частини застосунку імпортують лише звідси.
export { type Access, buildAccess } from './access';
export { ADMIN_ROLE_ID, OWNER_ROLE_ID } from './iam.constants';
export { covers, hasPermissions } from './iam.policy';
export { IamModule } from './iam.module';
export { IamService } from './iam.service';
export { isFreshStepUp, MfaService, STEP_UP_TTL_MS } from './mfa.service';
export { type OwnerGrantResult, OwnerBootstrapService } from './owner-bootstrap.service';
export { PermissionGuard } from './permission.guard';
export { totp } from './totp';
export {
  CurrentAccess,
  PERMISSIONS_KEY,
  RequirePermission,
  RequireStepUp,
} from '../../platform/require-permission';
