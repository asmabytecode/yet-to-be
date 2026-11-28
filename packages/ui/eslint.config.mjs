import { createConfig } from '@yet-to-be/eslint-config';

export default [
  ...createConfig({ tsconfigRootDir: import.meta.dirname }),
  {
    // Строгий CSP: жодного сирого HTML у спільних компонентах.
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: 'dangerouslySetInnerHTML заборонено (XSS, строгий CSP).',
        },
      ],
    },
  },
];
