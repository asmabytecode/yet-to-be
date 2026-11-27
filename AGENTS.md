# AGENTS.md — YET TO BE

Постійний контекст для AI-агента. Читати перед кожним етапом.

## Проєкт

Веб-застосунок з авторизацією (email+пароль і Google), профілем користувача та порожньою
головною сторінкою. Зараз будуємо масштабований і захищений **каркас**, а не фічі.

## Стек

pnpm workspaces + Turborepo · NestJS (Express) · TypeScript strict · Zod (спільні схеми в
`packages/shared`) · Prisma + SQLite (`better-sqlite3`) · argon2id · AES-256-GCM · JWT +
refresh-токени в httpOnly cookies · React + Vite · Vitest · Supertest · Playwright · Docker ·
Nginx · GitHub Actions.

## Структура

- `apps/api` — NestJS: модулі `src/auth`, `src/users`, `src/health`; `src/infra/crypto`, `src/database`,
  `src/config`, `src/common`; integration-тести — `test/integration/*.int.spec.ts`; `scripts/backup-db.mjs`
- `apps/web` — React SPA (`src/app`, `pages`, `features`, `shared`); E2E Playwright — `e2e/`
- `packages/shared` — Zod-схеми, DTO, коди помилок
- `packages/tsconfig`, `packages/eslint-config` — спільні конфіги
- `scripts/` — генерація секретів, перевірка `dist/`, `check-headers`, `wait-for`
- `infra/nginx` — конфіг Nginx і security-заголовки · `infra/deploy` — деплой по SSH · `infra/zap` — правила ZAP
- `docker-compose.yml` (+ `docker-compose.e2e.yml`) — production-подібний стек
- `.github/workflows` — `ci`, `security`, `release`, `deploy` · `docs/adr/` — рішення · `docs/scaling.md`, `docs/runbook-deploy.md`

## Робочий процес

1. Один етап за раз, строго за порядком 1 → 13. Наступний — лише після Definition of Done.
2. Після кожної зміни: `pnpm test:all && pnpm secrets:scan`; якщо зачеплено UI, Nginx чи cookies —
   ще `pnpm stack:e2e && pnpm stack:wait && pnpm check:headers && pnpm test:e2e`.
3. Тести пишуться разом з кодом. Покриття нового коду ≥ 80% (auth, crypto ≥ 90%).
4. Версії пакетів перевіряти через `pnpm view <pkg> version` і офіційну документацію, не з пам'яті.
5. Якщо ТЗ неоднозначне — зупинитись і поставити питання, не вгадувати.
6. Коміти: Conventional Commits (`feat:`, `fix:`, `test:`, `chore:`, `ci:`, `docs:`).
7. Код і назви — англійською; коментарі й документація — українською.
8. Нове архітектурне рішення → новий ADR у `docs/adr/`.
9. Нові GitHub Actions — лише з закріпленим commit SHA і коментарем версії.

## Правила безпеки (не підлягають порушенню)

1. Жодних секретів у Git: `.env*`, `*.db`, `*.pem`, `*.key` — в `.gitignore`; лише `.env.example`.
2. Жодних секретів у frontend: у бандл потрапляє лише `VITE_PUBLIC_*`.
3. Без source maps у production; API не віддає stack trace клієнту.
4. Паролі — лише argon2id (+ pepper). Не логувати, не повертати, не зберігати відкритими.
5. PII шифрується на рівні полів (AES-256-GCM) перед записом у БД.
6. Токени — лише в httpOnly + Secure + SameSite cookies. Ніколи в localStorage/sessionStorage/URL.
7. Увесь вхід валідується Zod `.strict()`; невідомі поля → 400.
8. Відповіді API — лише через DTO-мапер (allowlist полів), ніколи Prisma-модель напряму.
9. Заголовки: прибрати `X-Powered-By` і версію сервера; CSP, HSTS (prod), `nosniff`, `frame-ancestors 'none'`.
10. Логи з redaction: `password`, `token`, `cookie`, `authorization`, `secret`.
11. Однакові помилки авторизації — без розкриття, чи існує акаунт.
12. Rate limiting на auth-ендпоінтах + тимчасове блокування після невдалих спроб.
13. Залежності фіксує lockfile; `pnpm audit` без high/critical.
14. Мінімум привілеїв: Docker non-root, мінімальні `permissions` у GitHub Actions, actions за SHA.
15. IDOR: `userId` завжди із сесії, ніколи з body чи URL.
16. Тестові прапорці (`THROTTLE_DISABLED`, `OAUTH_MOCK`) заборонені в production валідацією env — не обходити.
