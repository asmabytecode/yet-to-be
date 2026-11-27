# Runbook: CI/CD, репозиторій і деплой

## Налаштування репозиторію GitHub (один раз)

1. **Settings → Rules → Rulesets → New branch ruleset** для `main`:
   - Require a pull request before merging, 1 approval, Require review from Code Owners;
   - Require status checks: `Lint, typecheck, unit + integration (coverage), build`,
     `E2E (Playwright × 3 browsers against docker compose)`, `Secrets (gitleaks, full history)`,
     `CodeQL (javascript-typescript)`, `pnpm audit (high+)`;
   - Block force pushes, Require linear history, (рекомендовано) Require signed commits.
2. **Settings → Code security**: Secret scanning + Push protection, Dependabot alerts і security updates,
   Private vulnerability reporting.
3. **Settings → Actions → General**: Workflow permissions = Read repository contents (за замовчуванням).
4. **Settings → Environments**:
   - `staging` і `production`; для `production` — Required reviewers (ви) і Deployment branches = тільки теги `v*`.
   - Secrets в кожному: `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY` (приватний ключ deploy-користувача),
     `DEPLOY_KNOWN_HOSTS` (вивід `ssh-keyscan -t ed25519 <host>`).
   - Variables: `APP_URL` (https-адреса стенда), `DEPLOY_PATH` (наприклад `/opt/yet-to-be`).

## Сервер (один VPS)

1. Docker Engine + compose plugin. Окремий користувач `deploy` без sudo; доступ до Docker — через
   rootless Docker або групу `docker` (пам'ятайте: група `docker` ≈ root, тому лише ключ із environment secret).
2. `sudo -u deploy mkdir -p /opt/yet-to-be && cd /opt/yet-to-be` і файл `.env` (права `600`):
   - секрети застосунку — `pnpm secrets:generate` локально, потім перенести значення;
   - справжні `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`;
   - `YTB_PUBLIC_URL=https://<домен>`, `YTB_API_IMAGE=ghcr.io/asmabytecode/yet-to-be-api`,
     `YTB_WEB_IMAGE=ghcr.io/asmabytecode/yet-to-be-web`.
3. TLS перед Nginx: Caddy / Traefik з Let's Encrypt або балансувальник провайдера, що проксіює на
   `127.0.0.1:8080`. Щоб Nginx не був доступний ззовні напряму, у `.env` задайте
   `YTB_HTTP_PORT=127.0.0.1:8080` (compose опублікує порт лише на loopback). HSTS для API вмикається
   в production автоматично, для статики — на TLS-проксі. Якщо перед Nginx є ще один проксі,
   API бачить два хопи — див. docs/scaling.md, розділ 2.
4. Якщо пакети GHCR приватні: `docker login ghcr.io` токеном з правом лише `read:packages`.
5. У Google Cloud Console додати redirect URI `https://<домен>/api/v1/auth/google/callback`.

## Реліз і деплой

```bash
git checkout main && git pull
git tag -a v0.1.0 -m "v0.1.0"
git push origin v0.1.0
```

- `release.yml`: образи `ghcr.io/asmabytecode/yet-to-be-{api,web}` з тегами `0.1.0`, `0.1`, `sha-…`,
  SBOM (SPDX), атестації SBOM і provenance, підпис cosign (keyless).
- `deploy.yml`: staging → smoke-тести → production (чекає вашого підтвердження в Actions).
- На сервері `infra/deploy/server-deploy.sh`: бекап БД → `docker compose pull` → `up -d`; міграції — сервіс `migrate`.

Перевірка підпису образу:

```bash
cosign verify ghcr.io/asmabytecode/yet-to-be-api:0.1.0 \
  --certificate-identity-regexp 'https://github.com/asmabytecode/yet-to-be/.github/workflows/release.yml@.*' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
gh attestation verify oci://ghcr.io/asmabytecode/yet-to-be-api:0.1.0 --repo asmabytecode/yet-to-be
```

## Rollback

```bash
cd /opt/yet-to-be
YTB_TAG=$(cat .previous-tag) docker compose up -d --no-build
```

Якщо нова версія застосувала міграцію, несумісну зі старою, відновіть БД з бекапу:

```bash
docker compose stop api web
docker compose run --rm --no-deps --entrypoint sh api -c \
  'cp /app/data/backups/yettobe-<час>.db /app/data/yettobe.db && rm -f /app/data/yettobe.db-wal /app/data/yettobe.db-shm'
YTB_TAG=$(cat .previous-tag) docker compose up -d --no-build
```
