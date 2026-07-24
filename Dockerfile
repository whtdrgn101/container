# syntax=docker/dockerfile:1

# Game Hub — a single image that serves the web UI and the API on one port, persisting games to
# SQLite. Container and Can't Stop (and the other registered games) all run on it. Built for a simple
# home-server / Portainer deploy.
#
# The runtime image ships neither the dev toolchain nor a package manager. The backend is bundled with
# esbuild into one file (`backend/dist/server.js`) that INLINES the workspace TS deps (@game-hub/engine,
# @game-hub/bot — whose `exports` point at .ts source, so they can't be `node`-run directly) and leaves
# only the native `better-sqlite3` external. So the runtime carries just Node + that bundle + a
# production-only node_modules holding the compiled SQLite binding + the static UI. No tsx, no vitest,
# no vite/tailwind, no typescript — and it runs as the unprivileged `node` user.

# ---- Build stage: install deps, compile the native SQLite module, build UI + bundle the backend ----
FROM node:22-bookworm-slim AS build
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@11.13.0 --activate
WORKDIR /app
COPY . .
# Install workspace deps; explicitly (re)build the native/binary deps so they're present regardless
# of pnpm's build-script gating.
RUN pnpm install --frozen-lockfile \
    && pnpm rebuild better-sqlite3 esbuild
# Build the static UI bundle (ui/dist) and the backend bundle (backend/dist/server.js).
RUN pnpm --filter @game-hub/ui build \
    && pnpm --filter @game-hub/backend build
# Honest boot-proof: run the *actual* bundle, hit /health and create a game over REST. If the bundle
# is broken (a missing external, an escaped require(), an ESM/CJS interop bug), the image fails to
# build here rather than crash-looping in production.
RUN cd backend && node scripts/smoke.mjs dist/server.js
# Produce a production-only tree for the backend: node_modules with just its runtime deps (crucially
# the *compiled* better-sqlite3 binding, copied from the store — no recompile), plus the bundle.
RUN pnpm --filter @game-hub/backend --legacy deploy --prod /prod

# ---- Runtime stage: just Node + the bundle + the native module + the static UI ----
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
# The esbuild bundle, the production node_modules (better-sqlite3 + its native binding), and the UI.
COPY --from=build /app/backend/dist /app/backend/dist
COPY --from=build /prod/node_modules /app/backend/node_modules
COPY --from=build /app/ui/dist /app/ui/dist
# Run unprivileged. The `node` user ships in the base image (uid 1000); make the data volume its own.
RUN mkdir -p /data && chown -R node:node /data
USER node
ENV HOST=0.0.0.0 \
    PORT=3001 \
    DATABASE_PATH=/data/game-hub.sqlite \
    UI_DIST=/app/ui/dist
EXPOSE 3001
VOLUME ["/data"]
# `docker run` users get a health check in the image itself (compose has its own too). No curl/wget in
# the slim image, so probe with Node's global fetch: exit 0 iff /health returns ok.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "backend/dist/server.js"]
