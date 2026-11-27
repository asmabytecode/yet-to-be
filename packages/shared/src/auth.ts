import { z } from 'zod';

/** Коди помилок API. Стабільні рядки, на які спирається фронтенд (не залежить від тексту). */
export const ERROR_CODES = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  BAD_REQUEST: 'BAD_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  RATE_LIMITED: 'RATE_LIMITED',
  NOT_READY: 'NOT_READY',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  AUTH_LOCKED: 'AUTH_LOCKED',
  AUTH_SESSION_EXPIRED: 'AUTH_SESSION_EXPIRED',
  AUTH_EMAIL_TAKEN: 'AUTH_EMAIL_TAKEN',
  AUTH_WEAK_PASSWORD: 'AUTH_WEAK_PASSWORD',
  CSRF_INVALID: 'CSRF_INVALID',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/** Єдиний формат тіла помилки (без відлуння введених значень). */
export const apiErrorSchema = z.object({
  statusCode: z.number().int(),
  code: z.string(),
  message: z.string(),
  requestId: z.string(),
  issues: z.array(z.object({ path: z.string(), code: z.string() })).optional(),
});

export type ApiError = z.infer<typeof apiErrorSchema>;

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

export const emailSchema = z.email().max(254);

/** Політика пароля: 10–128 символів, не лише пробіли. Перевірка зламаних паролів — на сервері. */
export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH)
  .max(PASSWORD_MAX_LENGTH)
  .refine((value) => value.trim().length > 0, 'Password must not be blank');

export const displayNameSchema = z.string().trim().min(1).max(50);

/** Строгі схеми: невідоме поле в тілі запиту → 400. */
export const registerSchema = z
  .strictObject({
    email: emailSchema,
    password: passwordSchema,
    displayName: displayNameSchema,
  })
  .refine((value) => value.password.trim().toLowerCase() !== value.email.trim().toLowerCase(), {
    path: ['password'],
    error: 'Password must differ from email',
  });

export const loginSchema = z.strictObject({
  email: emailSchema,
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

export const authProviderSchema = z.enum(['password', 'google']);
export type AuthProvider = z.infer<typeof authProviderSchema>;

/** Те, що API віддає про користувача. Ніколи — хеші, лічильники блокування, службові поля. */
export const userDtoSchema = z.object({
  id: z.string(),
  email: z.string(),
  displayName: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  bio: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  providers: z.array(authProviderSchema),
  createdAt: z.string(),
});

export type UserDto = z.infer<typeof userDtoSchema>;

export const csrfResponseSchema = z.object({ csrfToken: z.string() });
export type CsrfResponse = z.infer<typeof csrfResponseSchema>;
