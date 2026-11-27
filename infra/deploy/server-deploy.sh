#!/usr/bin/env bash
# Виконується на сервері: бекап БД → pull образів → перезапуск (міграції — сервіс migrate).
# Каталог DEPLOY_PATH містить docker-compose.yml і .env (секрети + YTB_PUBLIC_URL, YTB_*_IMAGE).
#
# Rollback: cd $DEPLOY_PATH && YTB_TAG=$(cat .previous-tag) docker compose up -d --no-build
#           (за потреби — відновити БД з data/backups, див. docs/runbook-deploy.md).
set -euo pipefail

tag="$1"
deploy_path="$2"
cd "$deploy_path"

if [ -f .deployed-tag ]; then
  cp .deployed-tag .previous-tag
fi

# 1. Онлайн-бекап SQLite, якщо стек уже працює.
if docker compose ps --status running --services | grep -qx api; then
  docker compose exec -T api node scripts/backup-db.mjs /app/data/backups
fi

# 2. Нові образи потрібного тегу.
export YTB_TAG="$tag"
docker compose pull migrate api web

# 3. Перезапуск: migrate застосує міграції, api стартує після нього, web — коли api healthy.
#    Готовність перевіряє smoke-тест у deploy.yml.
docker compose up -d --no-build --remove-orphans

printf '%s\n' "$tag" > .deployed-tag
echo "Deployed $tag"
