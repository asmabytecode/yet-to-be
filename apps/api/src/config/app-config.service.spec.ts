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
      }).isProd,
    ).toBe(true);
  });
});
