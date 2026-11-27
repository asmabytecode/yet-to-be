# Architecture Decision Records

Кожне архітектурне рішення — окремий файл `NNNN-<назва>.md` з розділами «Контекст», «Рішення»,
«Наслідки». Рішення не редагуються заднім числом: якщо змінюється підхід, пишеться новий ADR зі
статусом «Замінює NNNN», а старий отримує статус «Замінено NNNN».

| №                                             | Рішення                                        | Статус   |
| --------------------------------------------- | ---------------------------------------------- | -------- |
| [0001](0001-monorepo.md)                      | Монорепо на pnpm workspaces + Turborepo        | Прийнято |
| [0002](0002-sqlite-with-postgres-path.md)     | SQLite зараз, план переходу на PostgreSQL      | Прийнято |
| [0003](0003-cookies-not-localstorage.md)      | Токени в httpOnly cookies, а не в localStorage | Прийнято |
| [0004](0004-field-level-encryption.md)        | Шифрування PII на рівні полів                  | Прийнято |
| [0005](0005-e2e-against-production-images.md) | E2E проти production-образів з mock Google     | Прийнято |
