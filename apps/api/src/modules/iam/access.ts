import { isPermission, type Permission, PERMISSIONS, SYSTEM_ROLE_KEYS } from '@yet-to-be/shared';
import type { AccessSnapshot } from '../../common/request-context';

/** Права користувача на момент запиту. Обчислюються з БД, ніколи не беруться з токена. */
export type Access = AccessSnapshot & { permissions: ReadonlySet<Permission> };

export interface AccessRow {
  role: {
    key: string;
    requiresMfa: boolean;
    permissions: { permission: string }[];
  };
}

/**
 * Збирає права з ролей. Owner має весь каталог (нові права отримує автоматично).
 * Невідомі ключі з БД (наприклад, після видалення права з коду) ігноруються.
 */
export function buildAccess(userId: string, rows: readonly AccessRow[]): Access {
  const roleKeys = rows.map((row) => row.role.key);
  const isOwner = roleKeys.includes(SYSTEM_ROLE_KEYS.OWNER);
  const permissions = new Set<Permission>(
    isOwner
      ? PERMISSIONS
      : rows.flatMap((row) =>
          row.role.permissions.map((entry) => entry.permission).filter(isPermission),
        ),
  );
  return {
    userId,
    roleKeys,
    permissions,
    isOwner,
    requiresMfa: rows.some((row) => row.role.requiresMfa),
  };
}
