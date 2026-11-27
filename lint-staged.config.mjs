// Кореневий конфіг: файли поза пакетами (скрипти, конфіги, документація).
// Пакети з власним ESLint (apps/api, apps/web, packages/shared) мають свій конфіг поруч:
// lint-staged бере найближчий, а `eslint` береться з node_modules/.bin пакета.
export default {
  '*.{ts,tsx,js,mjs,cjs,json,md,yml,yaml}': 'prettier --write',
};
