/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // Лише VITE_PUBLIC_* потрапляє у бандл. Секретів на фронті не буває.
  envPrefix: 'VITE_PUBLIC_',
  server: {
    port: 5173,
    // Один origin у dev: /api -> NestJS
    proxy: { '/api': 'http://localhost:3000' },
  },
  build: { sourcemap: false },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
