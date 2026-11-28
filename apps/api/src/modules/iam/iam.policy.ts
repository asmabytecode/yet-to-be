import { ERROR_CODES, type Permission, SYSTEM_ROLE_KEYS } from '@yet-to-be/shared';
import { AppException } from '../../common/app-exception';
import type { Access } from './access';

/**
 * Політики IAM — чисті функції без БД, щоб їх можна було перевірити таблично.
 * Головне правило: ніхто не може дати (ні собі, ні іншим) більше, ніж має сам.
 */

export interface RoleShape {
  key: string;
  isSystem: boolean;
  permissions: readonly Permission[];
}

export function hasPermissions(access: Access, required: readonly Permission[]): boolean {
  return access.isOwner || required.every((permission) => access.permissions.has(permission));
}

/** Чи має актор кожне з прав (owner має все). */
export function covers(actor: Access, permissions: Iterable<Permission>): boolean {
  if (actor.isOwner) return true;
  for (const permission of permissions) {
    if (!actor.permissions.has(permission)) return false;
  }
  return true;
}

const escalation = () =>
  new AppException(403, ERROR_CODES.IAM_ESCALATION, 'Cannot grant permissions you do not have');
const systemRole = () =>
  new AppException(403, ERROR_CODES.IAM_SYSTEM_ROLE, 'System roles cannot be changed this way');
const selfModification = () =>
  new AppException(403, ERROR_CODES.IAM_SELF_MODIFICATION, 'You cannot change your own roles');

export function assertCanCreateRole(actor: Access, permissions: readonly Permission[]): void {
  if (!covers(actor, permissions)) throw escalation();
}

export function assertCanUpdateRole(
  actor: Access,
  role: RoleShape,
  nextPermissions: readonly Permission[] | undefined,
): void {
  if (role.key === SYSTEM_ROLE_KEYS.OWNER) throw systemRole();
  // Системну роль admin редагує лише owner: інакше адмін міг би розширити сам себе.
  if (role.isSystem && !actor.isOwner) throw systemRole();
  if (!covers(actor, role.permissions)) throw escalation();
  if (nextPermissions !== undefined && !covers(actor, nextPermissions)) throw escalation();
}

export function assertCanDeleteRole(actor: Access, role: RoleShape): void {
  if (role.isSystem) throw systemRole();
  if (!covers(actor, role.permissions)) throw escalation();
}

/**
 * Видача або зняття ролі. Актор не змінює себе, не чіпає owner'а і не керує тими,
 * хто має права, яких немає в нього.
 */
export function assertCanChangeAssignment(actor: Access, target: Access, role: RoleShape): void {
  if (role.key === SYSTEM_ROLE_KEYS.OWNER) throw systemRole();
  if (actor.userId === target.userId) throw selfModification();
  if (target.isOwner) throw systemRole();
  if (!covers(actor, role.permissions)) throw escalation();
  if (!covers(actor, target.permissions)) throw escalation();
}
