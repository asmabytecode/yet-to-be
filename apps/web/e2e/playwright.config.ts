import { defineConfig, devices } from '@playwright/test';

/**
 * E2E проти production-подібного стеку (Етап 11):
 *   docker compose -f docker-compose.yml -f docker-compose.e2e.yml up -d --build
 *   pnpm test:e2e
 * Інший стенд: E2E_BASE_URL=https://staging.example.com pnpm test:e2e
 * (APP_URL стенда має збігатися з E2E_BASE_URL — інакше спрацює CSRF-перевірка Origin).
 * Сценарії адмінки на віддаленому стенді пропускаються, якщо не задано E2E_OWNER_GRANT_CMD.
 */
const baseURL = process.env['E2E_BASE_URL'] ?? 'http://localhost:8080';
const isCI = Boolean(process.env['CI']);

export default defineConfig({
  testDir: '.',
  // Власник і адміністратори для сценаріїв адмінки (лише локальний стек, див. global-setup.ts).
  globalSetup: './global-setup.ts',
  outputDir: '../test-results',
  fullyParallel: true,
  forbidOnly: isCI,
  // Без повторів: нестабільний тест треба полагодити, а не сховати (DoD: 10 запусків без flaky).
  retries: 0,
  ...(isCI ? { workers: 2 } : {}),
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: [
    [isCI ? 'github' : 'list'],
    ['html', { outputFolder: '../playwright-report', open: 'never' }],
  ],
  use: {
    baseURL,
    locale: 'uk-UA',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
