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
pnpm dev        # API :3000, web :5173
```

## Команди

| Команда               | Що робить                         |
| --------------------- | --------------------------------- |
| `pnpm dev`            | API і web у watch-режимі          |
| `pnpm build`          | збірка всіх пакетів               |
| `pnpm lint`           | ESLint                            |
| `pnpm typecheck`      | TypeScript без емісії             |
| `pnpm test`           | unit / integration (Vitest)       |
| `pnpm secrets:scan`   | gitleaks по репозиторію           |
| `pnpm format`         | Prettier                          |

## Структура

Див. `AGENTS.md`. Етапи розробки описані в ТЗ «YET TO BE — Технічне завдання».

## Статус

- [x] Етап 1. Ініціалізація монорепозиторію
- [ ] Етапи 2–13
