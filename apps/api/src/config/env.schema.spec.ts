import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildValidEnv } from './env.fixture';
import { validateEnv } from './env.schema';

const prod = (overrides: Record<string, string> = {}) =>
  buildValidEnv({
    NODE_ENV: 'production',
    THROTTLE_DISABLED: 'false',
    APP_URL: 'https://example.com',
    GOOGLE_CALLBACK_URL: 'https://example.com/api/v1/auth/google/callback',
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

    it('rejects placeholder secrets', () => {
      expect(() =>
        validateEnv(prod({ GOOGLE_CLIENT_SECRET: 'change-me' })),
      ).toThrow(/GOOGLE_CLIENT_SECRET/);
    });

    it('allows the Google placeholder outside production', () => {
      expect(() => validateEnv(buildValidEnv({ GOOGLE_CLIENT_SECRET: 'change-me' }))).not.toThrow();
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
