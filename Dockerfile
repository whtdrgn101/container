# syntax=docker/dockerfile:1

# Game Hub — a single image that serves the web UI and the API on one port, persisting games to
# SQLite. Container and Can't Stop both run on it. Built for a simple home-server / Portainer deploy.

# ---- Build stage: install deps, compile the native SQLite module, build the web UI ----
FROM node:22-bookworm-slim AS build
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@11.13.0 --activate
WORKDIR /app
COPY . .
# Install workspace deps; explicitly (re)build the native/binary deps so they're present regardless
# of pnpm's build-script gating, then produce the static UI bundle (ui/dist).
RUN pnpm install --frozen-lockfile \
    && pnpm rebuild better-sqlite3 esbuild
RUN pnpm --filter @game-hub/ui build

# ---- Runtime stage: just Node + the app ----
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@11.13.0 --activate
WORKDIR /app
COPY --from=build /app /app
ENV HOST=0.0.0.0 \
    PORT=3001 \
    DATABASE_PATH=/data/game-hub.sqlite \
    UI_DIST=/app/ui/dist
RUN mkdir -p /data
EXPOSE 3001
VOLUME ["/data"]
CMD ["pnpm", "--filter", "@game-hub/backend", "start"]
