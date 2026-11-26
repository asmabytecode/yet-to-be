import { createConfig } from '@yet-to-be/eslint-config';

export default createConfig({
  tsconfigRootDir: import.meta.dirname,
  // process.env дозволено лише в config/ (з Етапу 2)
  allowProcessEnvIn: ['src/config/**/*.ts'],
});
