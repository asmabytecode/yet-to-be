/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Адмінка — окремий застосунок на тому самому origin під /admin/. Публічний бандл (web) не
 * містить коду адмінки, а адмінку можна буде винести на окремий домен без змін у коді.
 */
export default defineConfig({
  base: '/admin/',
  plugins: [react(), tailwindcss()],
  envDir: '../../',
  envPrefix: 'VITE_PUBLIC_',
  // Відкривати через сайт: http://localhost:5173/admin/ (той самий origin, що й API та cookies).
  server: {
    port: 5174,
    strictPort: true,
    proxy: { '/api': 'http://localhost:3000' },
  },
  build: { sourcemap: false },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/test/**',
        'src/main.tsx',
        'src/test-setup.ts',
        'src/i18n/uk.ts',
      ],
      // Каркас адмінки: поріг нижчий за web, піднімається разом із наповненням (ADR 0012).
      thresholds: { lines: 70, statements: 70, functions: 60, branches: 60 },
    },
  },
});
