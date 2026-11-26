import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import security from 'eslint-plugin-security';
import importPlugin from 'eslint-plugin-import';
import n from 'eslint-plugin-n';
import globals from 'globals';

/**
 * Базовий flat-config для всіх пакетів.
 * @param {{ tsconfigRootDir: string, allowProcessEnvIn?: string[] }} options
 */
export function createConfig({ tsconfigRootDir, allowProcessEnvIn = [] }) {
  return tseslint.config(
    { ignores: ['dist/**', 'coverage/**', 'node_modules/**', 'src/generated/**'] },
    js.configs.recommended,
    ...tseslint.configs.strictTypeChecked,
    security.configs.recommended,
    {
      languageOptions: {
        globals: { ...globals.node },
        parserOptions: { projectService: true, tsconfigRootDir },
      },
      plugins: { import: importPlugin, n },
      rules: {
        '@typescript-eslint/no-explicit-any': 'error',
        'no-console': 'error',
        'import/no-cycle': 'error',
        // NestJS-модулі — порожні класи з декоратором
        '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],
        // process.env читається лише в config/ (Етап 2)
        'n/no-process-env': 'error',
      },
    },
    {
      // JS-файли (конфіги) лежать поза TS-проєктом — без type-aware правил
      files: ['**/*.{js,mjs,cjs}'],
      extends: [tseslint.configs.disableTypeChecked],
    },
    ...(allowProcessEnvIn.length > 0
      ? [{ files: allowProcessEnvIn, rules: { 'n/no-process-env': 'off' } }]
      : []),
    {
      // Конфіги та тести можуть бути менш суворими
      files: ['**/*.config.{ts,js,mjs}', '**/*.spec.ts', '**/*.test.{ts,tsx}'],
      rules: {
        'n/no-process-env': 'off',
        'no-console': 'off',
        'security/detect-object-injection': 'off',
      },
    },
  );
}
