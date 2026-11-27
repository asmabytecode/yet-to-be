import { randomBytes } from 'node:crypto';

/** Валідний набір змінних для тестів. Усі секрети — випадкові, нічого не захардкоджено. */
export function buildValidEnv(overrides: Record<string, string> = {}): Record<string, string> {
  const key32 = (): string => randomBytes(32).toString('base64');
  return {
    NODE_ENV: 'development',
    APP_URL: 'http://localhost:5173',
    API_PORT: '3000',
    API_PREFIX: 'api',
    TRUST_PROXY: 'false',
    // Тести не впираються в rate limit; окремі тести вмикають його явно.
    THROTTLE_DISABLED: 'true',
    DATABASE_URL: 'file:./data/test.db',
    JWT_ACCESS_SECRET: randomBytes(64).toString('base64'),
    JWT_ACCESS_TTL: '15m',
    JWT_ISSUER: 'yet-to-be-api',
    JWT_AUDIENCE: 'yet-to-be-web',
    REFRESH_TOKEN_TTL_DAYS: '30',
    PASSWORD_PEPPER: key32(),
    COOKIE_SECRET: key32(),
    DATA_ENCRYPTION_KEYS: JSON.stringify({ k1: key32() }),
    DATA_ENCRYPTION_ACTIVE_KEY_ID: 'k1',
    BLIND_INDEX_KEY: key32(),
    GOOGLE_CLIENT_ID: 'test-client.apps.googleusercontent.com',
    GOOGLE_CLIENT_SECRET: 'test-secret',
    GOOGLE_CALLBACK_URL: 'http://localhost:5173/api/v1/auth/google/callback',
    ...overrides,
  };
}
