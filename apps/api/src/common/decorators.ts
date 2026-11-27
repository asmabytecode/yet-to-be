import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { AppRequest, AuthUser } from './request-context';

export const IS_PUBLIC_KEY = 'yet-to-be:public';
export const SKIP_CSRF_KEY = 'yet-to-be:skip-csrf';

/** Маршрут не вимагає автентифікації (за замовчуванням закрито все). */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);

/** Маршрут не перевіряється на CSRF (наприклад, вебхуки з власною підписом). */
export const SkipCsrf = (): MethodDecorator & ClassDecorator => SetMetadata(SKIP_CSRF_KEY, true);

/** Поточний користувач із запиту. Доступний лише на захищених маршрутах. */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  const user = ctx.switchToHttp().getRequest<AppRequest>().user;
  if (user === undefined) {
    throw new Error('CurrentUser used on a route without an authenticated user.');
  }
  return user;
});
