#!/usr/bin/env bash
# Запускається в GitHub Actions (deploy.yml): копіює docker-compose.yml на сервер
# і виконує там server-deploy.sh. Ключ і known_hosts — з секретів environment.
set -euo pipefail

: "${TAG:?TAG is required}"
: "${DEPLOY_HOST:?DEPLOY_HOST secret is required}"
: "${DEPLOY_USER:?DEPLOY_USER secret is required}"
: "${DEPLOY_SSH_KEY:?DEPLOY_SSH_KEY secret is required}"
: "${DEPLOY_KNOWN_HOSTS:?DEPLOY_KNOWN_HOSTS secret is required}"
: "${DEPLOY_PATH:?DEPLOY_PATH variable is required}"

key="$(mktemp)"
known="$(mktemp)"
trap 'rm -f "$key" "$known"' EXIT
printf '%s\n' "$DEPLOY_SSH_KEY" > "$key"
printf '%s\n' "$DEPLOY_KNOWN_HOSTS" > "$known"
chmod 600 "$key"

# StrictHostKeyChecking=yes: підключаємось лише до сервера з відомим ключем (без TOFU).
ssh_opts=(-i "$key" -o "UserKnownHostsFile=$known" -o StrictHostKeyChecking=yes -o BatchMode=yes)
target="$DEPLOY_USER@$DEPLOY_HOST"

scp "${ssh_opts[@]}" docker-compose.yml "$target:$DEPLOY_PATH/docker-compose.yml"
ssh "${ssh_opts[@]}" "$target" "bash -s -- '$TAG' '$DEPLOY_PATH'" < infra/deploy/server-deploy.sh
