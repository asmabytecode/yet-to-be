import { z } from 'zod';
import { PASSWORD_MAX_LENGTH, passwordSchema } from './auth';

const CONTROL_CHARS = /\p{Cc}/u;

/** Текст без керуючих символів (нульові байти, escape-послідовності тощо). */
const plainText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine((value) => !CONTROL_CHARS.test(value), 'Control characters are not allowed');

/** У біо дозволені переноси рядків, але не інші керуючі символи. */
const bioText = z
  .string()
  .trim()
  .max(500)
  .refine(
    (value) => !CONTROL_CHARS.test(value.replaceAll(/[\n\r]/g, '')),
    'Control characters are not allowed',
  );

/**
 * Оновлення профілю. Лише ці поля (allowlist); будь-яке інше (email, passwordHash, id…)
 * дає 400 завдяки strictObject. Порожній рядок у firstName/lastName/bio очищає значення.
 */
export const updateProfileSchema = z
  .strictObject({
    displayName: plainText(50).pipe(z.string().min(2)),
    firstName: plainText(50),
    lastName: plainText(50),
    bio: bioText,
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const changePasswordSchema = z
  .strictObject({
    currentPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
    newPassword: passwordSchema,
  })
  .refine((value) => value.currentPassword !== value.newPassword, {
    path: ['newPassword'],
    error: 'New password must differ from the current one',
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/** Встановлення пароля для акаунта, створеного через Google. */
export const setPasswordSchema = z.strictObject({ newPassword: passwordSchema });
export type SetPasswordInput = z.infer<typeof setPasswordSchema>;

export const sessionInfoSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  /** Час останнього оновлення токена (кожна ротація створює новий запис сесії). */
  lastUsedAt: z.string(),
  userAgent: z.string().nullable(),
  isCurrent: z.boolean(),
});
export type SessionInfo = z.infer<typeof sessionInfoSchema>;

/** Сторінки, на які дозволено повертати користувача після входу (зокрема через Google). */
export const RETURN_TO_ALLOWLIST: readonly string[] = ['/', '/profile', '/events'];

/** Динамічні сторінки: лише сторінка події з коректним slug (без `..`, `/` і великих літер). */
const RETURN_TO_PATTERNS: readonly RegExp[] = [/^\/events\/[a-z0-9]+(?:-[a-z0-9]+)*$/];

/** Повертає безпечний відносний шлях або '/'. Абсолютні URL, `//host` і `\` відкидаються. */
export function safeReturnTo(value: unknown): string {
  if (typeof value !== 'string') return '/';
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/';
  const path = value.split(/[?#]/)[0] ?? '/';
  const allowed =
    RETURN_TO_ALLOWLIST.includes(path) || RETURN_TO_PATTERNS.some((pattern) => pattern.test(path));
  return allowed ? path : '/';
}
