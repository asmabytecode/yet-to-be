# syntax=docker/dockerfile:1
# Production-образ API. Збирається з кореня монорепо:
#   docker build -f apps/api/Dockerfile .
# Debian slim, а не alpine: better-sqlite3 і argon2 ставляться з готових glibc-бінарників.

ARG NODE_IMAGE=node:22-bookworm-slim

FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    HUSKY=0 \
    CI=true
RUN corepack enable
WORKDIR /repo

FROM base AS build
# Компілятор — лише запасний варіант, якщо для нативного модуля немає готового бінарника.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
# Шар із залежностями інвалідується лише при зміні lockfile.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm fetch --frozen-lockfile
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --offline --frozen-lockfile --filter "api..." --filter yet-to-be
RUN pnpm --filter "api..." run build
# Лише production-залежності й файли з "files" у apps/api/package.json.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm --filter api deploy --prod --legacy /out

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    CHECKPOINT_DISABLE=1 \
    PRISMA_HIDE_UPDATE_MESSAGE=1
WORKDIR /app
RUN groupadd --system app \
 && useradd --system --gid app --home-dir /app --shell /usr/sbin/nologin app \
 && mkdir -p /app/data \
 && chown app:app /app/data
# Код належить root і лише читається користувачем app; писати можна тільки в /app/data (volume).
COPY --from=build /out ./
USER app
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/v1/health/ready').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
CMD ["node", "dist/main.js"]
