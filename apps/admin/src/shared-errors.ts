import { ApiError } from '@yet-to-be/ui';
import { i18n } from './i18n';

/** Людське повідомлення за кодом помилки API (без сирого тексту сервера). */
export function errorMessage(error: unknown): string {
  const code = error instanceof ApiError ? error.code : undefined;
  if (code !== undefined && i18n.exists(`errors.${code}`)) return i18n.t(`errors.${code}`);
  return i18n.t('errors.generic');
}

export function isApiError(error: unknown, code: string): boolean {
  return error instanceof ApiError && error.code === code;
}
