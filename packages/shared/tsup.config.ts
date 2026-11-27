import { defineConfig } from 'tsup';

// Два формати: ESM для web (Vite), CJS для NestJS API (CommonJS).
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: false,
});
