// Публічний API модуля audit. Інші модулі імпортують лише звідси.
export { ADMIN_AUDIT, type AdminAuditAction } from './audit.actions';
export { AuditModule } from './audit.module';
export {
  type AuditEntry,
  AuditService,
  type AuditTarget,
  type AuditTransaction,
} from './audit.service';
