import { applyDecorators, Controller, SetMetadata } from '@nestjs/common';

export const ADMIN_ROUTE_KEY = 'yet-to-be:admin-route';
export const ADMIN_PREFIX = 'admin';

/**
 * Контролер адмін-API: префікс `/api/v1/admin/<path>` і позначка для PermissionGuard.
 * Маршрут під цим декоратором без @RequirePermission отримує 403 (deny-by-default),
 * а тест-страж падає ще до запуску.
 */
export function AdminController(path: string): ClassDecorator {
  return applyDecorators(Controller(`${ADMIN_PREFIX}/${path}`), SetMetadata(ADMIN_ROUTE_KEY, true));
}
