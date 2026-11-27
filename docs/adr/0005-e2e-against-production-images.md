# 0005. E2E проти production-образів з mock Google

- Статус: прийнято
- Дата: 2026-11-27

## Контекст

E2E мають перевіряти те, що реально піде в production: Nginx-конфіг, заголовки, cookies, проксі.
Але справжній Google у CI недоступний (потрібна інтерактивна згода й реальні акаунти), а всі тести
йдуть з однієї IP-адреси й упираються в rate limiting.

## Рішення

- E2E запускаються проти `docker compose` з тими самими образами, що й production, плюс override
  `docker-compose.e2e.yml`: `NODE_ENV=test`, `OAUTH_MOCK=true`, `THROTTLE_DISABLED=true`.
- `OAUTH_MOCK` підміняє лише провайдера: start → state у підписаній cookie → сторінка згоди
  (`/api/v1/auth/google/mock-consent`) → callback → сесія. Увесь інший код потоку той самий.
- Обидва прапорці заборонені при `NODE_ENV=production` (валідація env), тож випадково ввімкнути їх
  у production неможливо — API просто не стартує.
- Локальний production-стек на `http://localhost:8080` дозволений: loopback-адреси браузери
  вважають безпечним контекстом. Будь-який інший хост у production — лише https. Атрибут `Secure`
  і префікси `__Host-` у cookies залежать від протоколу `APP_URL`.

## Наслідки

- E2E ловлять помилки конфігурації Nginx і cookies, а не лише логіки.
- Прямий інтеграційний тест справжнього Google лишається ручним (чекліст у README).
- Rate limiting перевіряється окремим інтеграційним тестом API, а не E2E.
