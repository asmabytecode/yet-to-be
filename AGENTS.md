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

- `apps/api` — NestJS (`src/modules/*`, `src/infra/*`, `src/config`, `src/common`)
- `apps/web` — React SPA (`src/app`, `pages`, `features`, `shared`)
- `packages/shared` — Zod-схеми, DTO, коди помилок
- `packages/tsconfig`, `packages/eslint-config` — спільні конфіги
- `infra/` — Nginx, docker-compose · `docs/adr/` — архітектурні рішення

## Робочий процес

1. Один етап за раз, строго за порядком 1 → 13. Наступний — лише після Definition of Done.
2. Після етапу: `pnpm lint && pnpm typecheck && pnpm test && pnpm secrets:scan`.
3. Тести пишуться разом з кодом. Покриття нового коду ≥ 80% (auth, crypto ≥ 90%).
4. Версії пакетів перевіряти через `pnpm view <pkg> version` і офіційну документацію, не з пам'яті.
5. Якщо ТЗ неоднозначне — зупинитись і поставити питання, не вгадувати.
6. Коміти: Conventional Commits (`feat:`, `fix:`, `test:`, `chore:`, `ci:`, `docs:`).
7. Код, назви, коментарі — англійською; документація — українською.

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
