import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildValidEnv } from './config/env.fixture';

describe('AppModule', () => {
  // Тест не залежить від реального .env: підставляємо валідне тестове оточення,
  // тому він однаково проходить локально й у CI, де .env немає.
  beforeAll(() => {
    for (const [name, value] of Object.entries(buildValidEnv())) {
      vi.stubEnv(name, value);
    }
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it('is defined', async () => {
    // Динамічний імпорт: AppConfigModule валідує env під час імпорту модуля.
    const { AppModule } = await import('./app.module');
    expect(AppModule).toBeDefined();
  });
});
