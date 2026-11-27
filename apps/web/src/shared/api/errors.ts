import type { FieldPath, FieldValues, UseFormSetError } from 'react-hook-form';
import { i18n } from '../../i18n';
import { ApiError } from './http';

/** Людське повідомлення для помилки API (за кодом, без показу сирого тексту сервера). */
export function errorMessage(error: unknown): string {
  const code = error instanceof ApiError ? error.code : undefined;
  if (code !== undefined && i18n.exists(`errors.${code}`)) return i18n.t(`errors.${code}`);
  return i18n.t('errors.generic');
}

/** Код помилки → поле форми. Усе, чого тут немає, показується як загальна помилка форми. */
export type FieldMap = Partial<Record<string, string>>;

/**
 * Накладає помилку сервера на форму: `issues` (валідація) — на відповідні поля, а коди
 * на кшталт AUTH_EMAIL_TAKEN — на поле з `codeFields`. Повертає загальне повідомлення,
 * якщо помилку не вдалося прив'язати до поля.
 */
export function applyServerError<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  fields: readonly string[],
  codeFields: FieldMap = {},
): string | null {
  if (error instanceof ApiError) {
    const targeted = error.issues.filter((issue) => fields.includes(issue.path));
    if (targeted.length > 0) {
      for (const issue of targeted) {
        setError(issue.path as FieldPath<T>, {
          type: 'server',
          message: i18n.t('validation.invalid_format'),
        });
      }
      return null;
    }
    const field = codeFields[error.code];
    if (field !== undefined) {
      setError(field as FieldPath<T>, { type: 'server', message: errorMessage(error) });
      return null;
    }
  }
  return errorMessage(error);
}
