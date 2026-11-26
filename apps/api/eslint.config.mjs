import { createConfig } from '@yet-to-be/eslint-config';

export default createConfig({
  tsconfigRootDir: import.meta.dirname,
  // process.env дозволено лише в config/ та в CLI-скриптах Prisma
  allowProcessEnvIn: ['src/config/**/*.ts', 'prisma/**/*.ts'],
});
