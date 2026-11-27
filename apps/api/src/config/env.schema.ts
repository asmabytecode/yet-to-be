import { z } from 'zod';

const PLACEHOLDER = 'change-me';

/** Рівно 32 байти у base64: 43 символи + один '='. */
const base64Key32 = z
  .string()
  .regex(/^[A-Za-z0-9+/]{43}=$/, 'must be base64 that decodes to exactly 32 bytes');

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    APP_URL: z.url(),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    API_PREFIX: z
      .string()
      .regex(/^[a-z][a-z0-9-]*$/)
      .default('api'),
    TRUST_PROXY: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),

    /** Лише для тестів: вимикає rate limiting. У production заборонено. */
    THROTTLE_DISABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),

    DATABASE_URL: z.string().startsWith('file:'),

    JWT_ACCESS_SECRET: z.string().min(64, 'must be at least 64 characters'),
    JWT_ACCESS_TTL: z.string().regex(/^\d+[smhd]$/, 'must look like 15m, 1h, 30s or 7d'),
    JWT_ISSUER: z.string().min(1),
    JWT_AUDIENCE: z.string().min(1),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
    PASSWORD_PEPPER: z.string().min(32, 'must be at least 32 characters'),
    COOKIE_SECRET: z.string().min(32, 'must be at least 32 characters'),

    DATA_ENCRYPTION_KEYS: z
      .string()
      .transform(parseJson)
      .pipe(
        z
          .record(z.string().min(1), base64Key32)
          .refine((keys) => Object.keys(keys).length > 0, 'must contain at least one key'),
      ),
    DATA_ENCRYPTION_ACTIVE_KEY_ID: z.string().min(1),
    BLIND_INDEX_KEY: base64Key32,

    GOOGLE_CLIENT_ID: z.string().min(1),
    GOOGLE_CLIENT_SECRET: z.string().min(1),
    GOOGLE_CALLBACK_URL: z.url(),
  })
  .superRefine((env, ctx) => {
    if (!Object.hasOwn(env.DATA_ENCRYPTION_KEYS, env.DATA_ENCRYPTION_ACTIVE_KEY_ID)) {
      ctx.addIssue({
        code: 'custom',
        path: ['DATA_ENCRYPTION_ACTIVE_KEY_ID'],
        message: 'must reference a key id present in DATA_ENCRYPTION_KEYS',
      });
    }

    if (env.NODE_ENV !== 'production') return;

    if (env.THROTTLE_DISABLED) {
      ctx.addIssue({
        code: 'custom',
        path: ['THROTTLE_DISABLED'],
        message: 'must not be enabled in production',
      });
    }

    if (!env.APP_URL.startsWith('https://')) {
      ctx.addIssue({ code: 'custom', path: ['APP_URL'], message: 'must use https:// in production' });
    }
    if (!env.GOOGLE_CALLBACK_URL.startsWith('https://')) {
      ctx.addIssue({
        code: 'custom',
        path: ['GOOGLE_CALLBACK_URL'],
        message: 'must use https:// in production',
      });
    }

    const mustBeReal: Record<string, string> = {
      JWT_ACCESS_SECRET: env.JWT_ACCESS_SECRET,
      PASSWORD_PEPPER: env.PASSWORD_PEPPER,
      COOKIE_SECRET: env.COOKIE_SECRET,
      GOOGLE_CLIENT_ID: env.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: env.GOOGLE_CLIENT_SECRET,
    };
    for (const [name, value] of Object.entries(mustBeReal)) {
      if (value.includes(PLACEHOLDER)) {
        ctx.addIssue({
          code: 'custom',
          path: [name],
          message: `must not contain the "${PLACEHOLDER}" placeholder in production`,
        });
      }
    }
  });

export type Env = z.output<typeof envSchema>;

/**
 * Валідує змінні оточення. Повідомлення про помилку містить лише назви змінних
 * і причину — ніколи самі значення (щоб секрети не потрапили в логи).
 */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (result.success) return result.data;

  const lines = result.error.issues.map(
    (issue) => ` - ${issue.path.join('.') || '(root)'}: ${issue.message}`,
  );
  throw new Error(
    `Invalid environment configuration:\n${lines.join('\n')}\n` +
      'Hint: run "pnpm secrets:generate" to create a .env with strong secrets.',
  );
}
