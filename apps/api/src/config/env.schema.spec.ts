import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildValidEnv } from './env.fixture';
import { isSecureOrigin, validateEnv } from './env.schema';

const prod = (overrides: Record<string, string> = {}) =>
  buildValidEnv({
    NODE_ENV: 'production',
    THROTTLE_DISABLED: 'false',
    APP_URL: 'https://example.com',
    GOOGLE_CALLBACK_URL: 'https://example.com/api/v1/auth/google/callback',
    STORAGE_DRIVER: 's3',
    S3_ACCESS_KEY_ID: 'ytb-api',
    S3_SECRET_ACCESS_KEY: randomBytes(24).toString('base64'),
    MALWARE_SCANNER: 'clamav',
    ...overrides,
  });

describe('validateEnv', () => {
  it('accepts a valid environment and applies transformations', () => {
    const env = validateEnv(buildValidEnv({ API_PORT: '4000', TRUST_PROXY: 'true' }));

    expect(env.API_PORT).toBe(4000);
    expect(env.TRUST_PROXY).toBe(true);
    expect(Object.keys(env.DATA_ENCRYPTION_KEYS)).toEqual(['k1']);
  });

  it('applies defaults for optional variables', () => {
    const raw = buildValidEnv();
    delete raw['API_PORT'];
    delete raw['API_PREFIX'];
    delete raw['TRUST_PROXY'];

    const env = validateEnv(raw);

    expect(env.API_PORT).toBe(3000);
    expect(env.API_PREFIX).toBe('api');
    expect(env.TRUST_PROXY).toBe(false);
  });

  it('rejects a missing required variable', () => {
    const raw = buildValidEnv();
    delete raw['JWT_ACCESS_SECRET'];

    expect(() => validateEnv(raw)).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('rejects short secrets', () => {
    expect(() => validateEnv(buildValidEnv({ JWT_ACCESS_SECRET: 'too-short' }))).toThrow(
      /JWT_ACCESS_SECRET/,
    );
    expect(() => validateEnv(buildValidEnv({ PASSWORD_PEPPER: 'short' }))).toThrow(
      /PASSWORD_PEPPER/,
    );
  });

  it('rejects encryption keys that are not exactly 32 bytes', () => {
    const sixteenBytes = randomBytes(16).toString('base64');

    expect(() => validateEnv(buildValidEnv({ BLIND_INDEX_KEY: sixteenBytes }))).toThrow(
      /BLIND_INDEX_KEY/,
    );
    expect(() =>
      validateEnv(buildValidEnv({ DATA_ENCRYPTION_KEYS: JSON.stringify({ k1: sixteenBytes }) })),
    ).toThrow(/DATA_ENCRYPTION_KEYS/);
  });

  it('rejects DATA_ENCRYPTION_KEYS that is not valid JSON', () => {
    expect(() => validateEnv(buildValidEnv({ DATA_ENCRYPTION_KEYS: 'not json' }))).toThrow(
      /DATA_ENCRYPTION_KEYS/,
    );
  });

  it('rejects an active key id that is not among the keys', () => {
    expect(() => validateEnv(buildValidEnv({ DATA_ENCRYPTION_ACTIVE_KEY_ID: 'k2' }))).toThrow(
      /DATA_ENCRYPTION_ACTIVE_KEY_ID/,
    );
  });

  it('rejects a non-sqlite DATABASE_URL', () => {
    expect(() => validateEnv(buildValidEnv({ DATABASE_URL: 'postgres://x' }))).toThrow(
      /DATABASE_URL/,
    );
  });

  describe('production', () => {
    it('accepts a valid production environment', () => {
      expect(validateEnv(prod()).NODE_ENV).toBe('production');
    });

    it('rejects THROTTLE_DISABLED=true', () => {
      expect(() => validateEnv(prod({ THROTTLE_DISABLED: 'true' }))).toThrow(/THROTTLE_DISABLED/);
    });

    it('rejects an http:// APP_URL', () => {
      expect(() => validateEnv(prod({ APP_URL: 'http://example.com' }))).toThrow(/APP_URL/);
    });

    it('accepts http:// on loopback hosts (local docker compose)', () => {
      const local = prod({
        APP_URL: 'http://localhost:8080',
        GOOGLE_CALLBACK_URL: 'http://localhost:8080/api/v1/auth/google/callback',
      });
      expect(validateEnv(local).APP_URL).toBe('http://localhost:8080');
    });

    it('rejects an http:// Google callback on a public host', () => {
      expect(() =>
        validateEnv(
          prod({ GOOGLE_CALLBACK_URL: 'http://example.com/api/v1/auth/google/callback' }),
        ),
      ).toThrow(/GOOGLE_CALLBACK_URL/);
    });

    it('rejects OAUTH_MOCK=true', () => {
      expect(() => validateEnv(prod({ OAUTH_MOCK: 'true' }))).toThrow(/OAUTH_MOCK/);
    });

    it('rejects placeholder secrets', () => {
      expect(() => validateEnv(prod({ GOOGLE_CLIENT_SECRET: 'change-me' }))).toThrow(
        /GOOGLE_CLIENT_SECRET/,
      );
    });

    it('requires S3 storage and a real malware scanner', () => {
      expect(() => validateEnv(prod({ STORAGE_DRIVER: 'memory' }))).toThrow(/STORAGE_DRIVER/);
      expect(() => validateEnv(prod({ MALWARE_SCANNER: 'fake' }))).toThrow(/MALWARE_SCANNER/);
      expect(() => validateEnv(prod({ S3_SECRET_ACCESS_KEY: 'change-me' }))).toThrow(
        /S3_SECRET_ACCESS_KEY/,
      );
    });

    it('requires S3 credentials whenever the s3 driver is used', () => {
      expect(() => validateEnv(buildValidEnv({ STORAGE_DRIVER: 's3' }))).toThrow(
        /S3_ACCESS_KEY_ID/,
      );
    });

    it('rejects unsafe media URLs and bucket names', () => {
      expect(() =>
        validateEnv(buildValidEnv({ MEDIA_PUBLIC_BASE_URL: 'javascript:alert(1)' })),
      ).toThrow(/MEDIA_PUBLIC_BASE_URL/);
      expect(() => validateEnv(buildValidEnv({ S3_BUCKET_MEDIA: '../etc' }))).toThrow(
        /S3_BUCKET_MEDIA/,
      );
    });

    it('allows the Google placeholder outside production', () => {
      expect(() => validateEnv(buildValidEnv({ GOOGLE_CLIENT_SECRET: 'change-me' }))).not.toThrow();
    });
  });

  it('enables the OAuth mock only when asked', () => {
    expect(validateEnv(buildValidEnv()).OAUTH_MOCK).toBe(false);
    expect(validateEnv(buildValidEnv({ OAUTH_MOCK: 'true' })).OAUTH_MOCK).toBe(true);
  });

  describe('isSecureOrigin', () => {
    it.each([
      ['https://example.com', true],
      ['http://localhost:8080', true],
      ['http://127.0.0.1:3000', true],
      ['http://[::1]:8080', true],
      ['http://example.com', false],
      ['http://localhost.example.com', false],
    ])('%s -> %s', (url, expected) => {
      expect(isSecureOrigin(url)).toBe(expected);
    });
  });

  it('never leaks secret values into the error message', () => {
    const secret = 'super-secret-value-that-must-not-leak';
    let message = '';
    try {
      validateEnv(buildValidEnv({ JWT_ACCESS_SECRET: secret, BLIND_INDEX_KEY: secret }));
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toContain('BLIND_INDEX_KEY');
    expect(message).not.toContain(secret);
  });
});
