import { z } from 'zod';

const PLACEHOLDER = 'change-me';
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Браузери вважають loopback-адреси безпечним контекстом, тому локальний production-стек
 * (`docker compose` на http://localhost:8080) дозволений і без TLS. Будь-який інший хост — лише https.
 */
export function isSecureOrigin(url: string): boolean {
  const parsed = new URL(url);
  return parsed.protocol === 'https:' || LOOPBACK_HOSTS.has(parsed.hostname);
}

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

    /**
     * Лише для E2E: замість Google використовується локальний mock-провайдер
     * (сторінка згоди на самому API). У production заборонено.
     */
    OAUTH_MOCK: z
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

    // ---- Медіа (Етап 14.6) ----
    /** memory — лише для тестів і розробки без MinIO; у production — тільки s3. */
    STORAGE_DRIVER: z.enum(['s3', 'memory']).default('memory'),
    S3_ENDPOINT: z.url().optional(),
    S3_REGION: z.string().min(1).default('us-east-1'),
    S3_ACCESS_KEY_ID: z.string().min(1).optional(),
    S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
    S3_FORCE_PATH_STYLE: z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => value === 'true'),
    S3_BUCKET_QUARANTINE: z
      .string()
      .regex(/^[a-z0-9][a-z0-9.-]{2,62}$/)
      .default('ytb-quarantine'),
    S3_BUCKET_MEDIA: z
      .string()
      .regex(/^[a-z0-9][a-z0-9.-]{2,62}$/)
      .default('ytb-media'),
    /** Звідки браузер завантажує готові варіанти (Nginx проксує на bucket media). */
    MEDIA_PUBLIC_BASE_URL: z
      .string()
      .regex(/^(\/[a-z0-9/_-]*|https:\/\/\S+)$/)
      .default('/media'),
    /** fake — лише для тестів: «знаходить» тільки тестовий рядок EICAR. */
    MALWARE_SCANNER: z.enum(['clamav', 'fake']).default('fake'),
    CLAMAV_HOST: z.string().min(1).default('clamav'),
    CLAMAV_PORT: z.coerce.number().int().min(1).max(65535).default(3310),
    MEDIA_MAX_BYTES: z.coerce
      .number()
      .int()
      .min(1024)
      .max(50 * 1024 * 1024)
      .default(10 * 1024 * 1024),
    /** Захист від «піксельних бомб»: максимальна кількість пікселів оригіналу. */
    MEDIA_MAX_PIXELS: z.coerce.number().int().min(10_000).max(100_000_000).default(40_000_000),
  })
  .superRefine((env, ctx) => {
    if (!Object.hasOwn(env.DATA_ENCRYPTION_KEYS, env.DATA_ENCRYPTION_ACTIVE_KEY_ID)) {
      ctx.addIssue({
        code: 'custom',
        path: ['DATA_ENCRYPTION_ACTIVE_KEY_ID'],
        message: 'must reference a key id present in DATA_ENCRYPTION_KEYS',
      });
    }

    if (env.STORAGE_DRIVER === 's3') {
      for (const name of ['S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'] as const) {
        if (env[name] === undefined) {
          ctx.addIssue({
            code: 'custom',
            path: [name],
            message: 'is required when STORAGE_DRIVER=s3',
          });
        }
      }
    }

    if (env.NODE_ENV !== 'production') return;

    if (env.STORAGE_DRIVER !== 's3') {
      ctx.addIssue({
        code: 'custom',
        path: ['STORAGE_DRIVER'],
        message: 'must be "s3" in production',
      });
    }
    if (env.MALWARE_SCANNER !== 'clamav') {
      ctx.addIssue({
        code: 'custom',
        path: ['MALWARE_SCANNER'],
        message: 'must be "clamav" in production',
      });
    }

    if (env.THROTTLE_DISABLED) {
      ctx.addIssue({
        code: 'custom',
        path: ['THROTTLE_DISABLED'],
        message: 'must not be enabled in production',
      });
    }

    if (env.OAUTH_MOCK) {
      ctx.addIssue({
        code: 'custom',
        path: ['OAUTH_MOCK'],
        message: 'must not be enabled in production',
      });
    }

    if (!isSecureOrigin(env.APP_URL)) {
      ctx.addIssue({
        code: 'custom',
        path: ['APP_URL'],
        message: 'must use https:// in production',
      });
    }
    if (!isSecureOrigin(env.GOOGLE_CALLBACK_URL)) {
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
      S3_SECRET_ACCESS_KEY: env.S3_SECRET_ACCESS_KEY ?? '',
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
