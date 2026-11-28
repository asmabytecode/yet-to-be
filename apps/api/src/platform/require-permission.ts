import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Permission } from '@yet-to-be/shared';
import type { AccessSnapshot, AppRequest } from '../common/request-context';

export const PERMISSIONS_KEY = 'yet-to-be:permissions';
export const STEP_UP_KEY = 'yet-to-be:step-up';

/**
 * Маршрут вимагає ВСІХ перелічених прав. Перевіряє глобальний PermissionGuard (модуль iam);
 * права беруться з БД на кожен запит. Декоратор живе в platform, щоб будь-який модуль міг
 * його використати без залежності від iam.
 */
export const RequirePermission = (
  ...permissions: [Permission, ...Permission[]]
): MethodDecorator & ClassDecorator => SetMetadata(PERMISSIONS_KEY, permissions);

/** Критична дія: потрібне свіже повторне підтвердження (пароль або TOTP, діє 5 хв). */
export const RequireStepUp = (): MethodDecorator & ClassDecorator => SetMetadata(STEP_UP_KEY, true);

/** Права поточного користувача; доступні лише на маршрутах з @RequirePermission. */
export const CurrentAccess = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AccessSnapshot => {
    const access = ctx.switchToHttp().getRequest<AppRequest>().access;
    if (access === undefined) {
      throw new Error('CurrentAccess used on a route without @RequirePermission.');
    }
    return access;
  },
);
