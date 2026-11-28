/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Лише VITE_PUBLIC_* потрапляє у бандл. Секретів на фронті не буває.
  // .env лежить у корені монорепо; Vite однаково експонує лише VITE_PUBLIC_*
  envDir: '../../',
  envPrefix: 'VITE_PUBLIC_',
  server: {
    port: 5173,
    // Один origin у dev, як у production за Nginx: /api -> NestJS, /admin -> dev-сервер адмінки.
    // Інакше адмінка на :5174 мала б інший Origin, і CSRF-перевірка API відхиляла б її запити.
    proxy: {
      '/api': 'http://localhost:3000',
      '/admin': { target: 'http://localhost:5174', ws: true },
    },
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
      thresholds: { lines: 80, statements: 80, functions: 80, branches: 75 },
    },
  },
});
