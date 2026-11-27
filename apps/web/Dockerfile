# syntax=docker/dockerfile:1
# Production-образ фронтенду: статика + reverse proxy на API. Збирається з кореня монорепо:
#   docker build -f apps/web/Dockerfile .

ARG NODE_IMAGE=node:22-bookworm-slim
ARG NGINX_IMAGE=nginxinc/nginx-unprivileged:1-alpine

FROM ${NODE_IMAGE} AS build
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    HUSKY=0 \
    CI=true
RUN corepack enable
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm fetch --frozen-lockfile
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --offline --frozen-lockfile --filter "web..." --filter yet-to-be
# Лише публічні значення (VITE_PUBLIC_*); секрети в бандл потрапити не можуть.
ARG VITE_PUBLIC_APP_NAME="YET TO BE"
ENV VITE_PUBLIC_APP_NAME=${VITE_PUBLIC_APP_NAME}
# build = tsc + vite build + check-dist-secrets (падає, якщо в dist є секрети чи source maps).
RUN pnpm --filter "web..." run build

FROM ${NGINX_IMAGE} AS runtime
# Образ nginx-unprivileged працює від uid 101 і слухає 8080.
COPY infra/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY infra/nginx/snippets/ /etc/nginx/snippets/
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=5 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
