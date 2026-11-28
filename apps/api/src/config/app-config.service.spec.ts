import type { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { AppConfigService } from './app-config.service';
import { buildValidEnv } from './env.fixture';
import { validateEnv, type Env } from './env.schema';

function createService(overrides: Record<string, string> = {}): AppConfigService {
  const env = validateEnv(buildValidEnv(overrides));
  const fake = { get: (key: keyof Env) => env[key] } as unknown as ConfigService<Env, true>;
  return new AppConfigService(fake);
}

describe('AppConfigService', () => {
  it('exposes grouped, typed settings', () => {
    const config = createService({ API_PORT: '4100' });

    expect(config.app.port).toBe(4100);
    expect(config.app.apiPrefix).toBe('api');
    expect(config.database.url).toBe('file:./data/test.db');
    expect(config.auth.jwtAccessTtl).toBe('15m');
    expect(config.crypto.activeKeyId).toBe('k1');
    expect(Object.keys(config.crypto.keys)).toEqual(['k1']);
    expect(config.google.callbackUrl).toContain('/auth/google/callback');
  });

  it('reports isProd correctly', () => {
    expect(createService().isProd).toBe(false);
    expect(
      createService({
        NODE_ENV: 'production',
        THROTTLE_DISABLED: 'false',
        APP_URL: 'https://example.com',
        GOOGLE_CALLBACK_URL: 'https://example.com/cb',
        STORAGE_DRIVER: 's3',
        S3_ACCESS_KEY_ID: 'ytb-api',
        S3_SECRET_ACCESS_KEY: 'a-real-secret-value',
        MALWARE_SCANNER: 'clamav',
      }).isProd,
    ).toBe(true);
  });

  it('exposes media settings with safe defaults', () => {
    expect(createService().media).toMatchObject({
      storageDriver: 'memory',
      scanner: 'fake',
      buckets: { quarantine: 'ytb-quarantine', media: 'ytb-media' },
      publicBaseUrl: '/media',
      maxBytes: 10 * 1024 * 1024,
      maxPixels: 40_000_000,
    });
  });

  it('uses Secure cookies only for an https APP_URL', () => {
    expect(createService().secureCookies).toBe(false);
    expect(createService({ APP_URL: 'https://example.com' }).secureCookies).toBe(true);
  });
});
