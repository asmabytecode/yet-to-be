import { createConfig } from '@yet-to-be/eslint-config';

export default [
  ...createConfig({ tsconfigRootDir: import.meta.dirname }),
  {
    // Строгий CSP: жодного вставлення сирого HTML і жодних inline-скриптів.
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: 'dangerouslySetInnerHTML заборонено (XSS, строгий CSP).',
        },
        {
          selector: "Property[key.name='dangerouslySetInnerHTML']",
          message: 'dangerouslySetInnerHTML заборонено (XSS, строгий CSP).',
        },
      ],
    },
  },
];
