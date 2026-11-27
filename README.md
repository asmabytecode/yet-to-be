# YET TO BE

Монорепозиторій: NestJS API (`apps/api`) + React/Vite (`apps/web`) + спільні пакети (`packages/*`).

## Вимоги

- Node.js >= 22.12 (`.nvmrc`)
- pnpm 10 (`corepack enable`)
- [gitleaks](https://github.com/gitleaks/gitleaks) (для `pnpm secrets:scan` і pre-commit)

## Запуск

```bash
corepack enable
pnpm install
pnpm secrets:generate   # створює .env з випадковими секретами (існуючий не перезаписує)
pnpm db:migrate         # створює/оновлює локальну SQLite-БД (apps/api/data)
pnpm dev                # API :3000, web :5173
```

## Команди

| Команда               | Що робить                                         |
| --------------------- | ------------------------------------------------- |
| `pnpm dev`            | API і web у watch-режимі                          |
| `pnpm build`          | збірка всіх пакетів                               |
| `pnpm lint`           | ESLint                                            |
| `pnpm typecheck`      | TypeScript без емісії                             |
| `pnpm test`           | unit / integration (Vitest)                       |
| `pnpm secrets:scan`   | gitleaks по репозиторію                           |
| `pnpm format`         | Prettier                                          |
| `pnpm db:generate`    | генерує Prisma Client (також запускається на install) |
| `pnpm db:migrate`     | створює й застосовує міграцію (dev)               |
| `pnpm db:migrate:deploy` | застосовує готові міграції (CI / production)   |
| `pnpm db:seed`        | dev-seed (лише не в production)                   |
| `pnpm db:studio`      | Prisma Studio                                     |
| `pnpm db:reset`       | скидає dev-БД й застосовує міграції заново        |

## База даних

SQLite-файл лежить у `apps/api/data/` і не потрапляє в git. Схема — `apps/api/prisma/schema.prisma`,
міграції — `apps/api/prisma/migrations/` (комітяться). Тести створюють власну тимчасову БД із цих міграцій.

## Структура

Див. `AGENTS.md`. Етапи розробки описані в ТЗ «YET TO BE — Технічне завдання».

## Статус

- [x] Етап 1. Ініціалізація монорепозиторію
- [x] Етап 2. Конфігурація та секрети
- [x] Етап 3. База даних (Prisma + SQLite)
- [x] Етап 4. Каркас NestJS і приховані заголовки
- [x] Етап 5. Шифрування (argon2id + pepper, AES-256-GCM, blind index)
- [x] Етап 6. Авторизація: логін і пароль
- [ ] Етапи 7–13
