// Звичайний об'єкт без імпорту: API — CommonJS, а vitest/config — ESM-only.
//
// Рівні тестів (Етап 10):
//   unit        — src/**/*.spec.ts поруч із кодом          (pnpm test:unit)
//   integration — test/integration/*.int.spec.ts, Supertest + власна SQLite на кожен файл (pnpm test:int)
// Пороги покриття перевіряє `pnpm test:cov`; CI падає, якщо їх порушено.
export default {
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
    setupFiles: ['./test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      include: ['src/**/*.ts'],
      // src/cli — тонкі точки входу команд; їхня логіка (OwnerBootstrapService, AuditService) покрита тестами.
      exclude: [
        'src/main.ts',
        'src/cli/**',
        'src/generated/**',
        'src/**/*.fixture.ts',
        'src/**/*.spec.ts',
      ],
      thresholds: {
        lines: 80,
        statements: 80,
        functions: 80,
        branches: 75,
        // Критичні для безпеки модулі — суворіше.
        'src/auth/**': { lines: 90, statements: 90 },
        'src/infra/crypto/**': { lines: 90, statements: 90 },
        // Етап 14: права, MFA і журнал.
        'src/modules/iam/**': { lines: 90, statements: 90 },
        'src/modules/audit/**': { lines: 90, statements: 90 },
        'src/database/audit-*.ts': { lines: 90, statements: 90 },
      },
    },
  },
};
