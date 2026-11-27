import type { ConfigService } from '@nestjs/config';
import { AppConfigService } from '../src/config/app-config.service';
import { buildValidEnv } from '../src/config/env.fixture';
import { validateEnv, type Env } from '../src/config/env.schema';

/** Справжній AppConfigService поверх валідованого тестового env — без Nest-контейнера. */
export function createTestConfig(overrides: Record<string, string> = {}): AppConfigService {
  const env = validateEnv(buildValidEnv(overrides));
  const fake = { get: (key: keyof Env) => env[key] } as unknown as ConfigService<Env, true>;
  return new AppConfigService(fake);
}
