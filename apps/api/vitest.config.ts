// Звичайний об'єкт без імпорту: API — CommonJS, а vitest/config — ESM-only.
export default {
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
    setupFiles: ['./test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/main.ts', 'src/generated/**', 'src/**/*.fixture.ts'],
    },
  },
};
