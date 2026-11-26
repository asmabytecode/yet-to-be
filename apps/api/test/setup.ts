import { vi } from 'vitest';
import { buildValidEnv } from '../src/config/env.fixture';

// Валідне тестове оточення для всіх тестів API. Тести не залежать від реального
// .env, тому однаково проходять локально й у CI, де .env немає.
for (const [name, value] of Object.entries(buildValidEnv())) {
  vi.stubEnv(name, value);
}
