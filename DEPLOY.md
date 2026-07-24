# Deploying Game Hub on a home server (Portainer)

Game Hub ships as a **single Docker image** that serves both the web UI and the API on one port and
stores games in SQLite on a mounted volume. No accounts, no external services — just run it on your
LAN and share the URL with family/friends.

## What the image does

- One Node process (Fastify) serves:
  - the built web app at `/`
  - the REST API (`/games`, `/lobbies`, `/health`) at the same origin
  - the live-sync WebSocket at `/games/:id/stream`
- Games persist to `DATABASE_PATH` (default `/data/game-hub.sqlite`). Mount `/data` to a volume so
  they survive restarts and image updates.

The image is **slim**: the backend is bundled (esbuild) into a single `backend/dist/server.js`, so the
runtime ships only Node, that bundle, the native SQLite module and the static UI — no dev toolchain
(no vite/tailwind/vitest/typescript/tsx), no package manager. It runs as the unprivileged **`node`**
user and carries its **own `HEALTHCHECK`** (`GET /health`), so even a bare
`docker run` — with no compose file — gets container health status and auto-restart-on-unhealthy.

### Environment variables

| Var             | Default                   | Notes                                        |
|-----------------|---------------------------|----------------------------------------------|
| `PORT`          | `3001`                    | Port inside the container.                   |
| `HOST`          | `0.0.0.0`                 | Leave as-is so it's reachable on your LAN.    |
| `DATABASE_PATH` | `/data/game-hub.sqlite`  | Keep it under the mounted volume.            |
| `UI_DIST`       | `/app/ui/dist`            | Where the built UI lives; don't change.      |

---

## Option A — Portainer "Stack" + Watchtower (recommended)

`docker-compose.yml` references the **CI-built image** (`whtdrgn101/game-hub:latest`, pushed to
Docker Hub on every main merge) — the NAS never builds from source.

1. In Portainer: **Stacks → Add stack**.
2. Name it `game-hub`.
3. Choose a method:
   - **Repository:** point it at your Git repo URL; set the Compose path to `docker-compose.yml`.
     (The repo's `docker-compose.override.yml` is local-dev only; Portainer reads just the file you
     name here.)
   - **Web editor:** paste the contents of `docker-compose.yml`.
4. **Deploy the stack.** Portainer pulls the image from Docker Hub and starts the service.
5. Open `http://<your-nas-ip>:8080`.

**Updates are automatic with Watchtower**: the compose sets
`com.centurylinklabs.watchtower.enable: "true"` (required — the owner's Watchtower is label-scoped so
that version-pinned services like Jellyfin/Gitea are never auto-updated). CI pushes a new `:latest`
on merge; Watchtower's next poll pulls it and recreates the container (the `/data` volume — your games — survives, and the server's
`SIGTERM` handler shuts it down cleanly inside Watchtower's stop timeout). Without Watchtower, use the
stack's **"Re-pull image and redeploy"** button. **Rollback**: CI also pushes an immutable `:v<run>`
tag per build — edit the stack to pin one (`whtdrgn101/game-hub:v123`) to step back a version; note
Watchtower will then leave it alone (it only follows moving tags like `:latest`), which is exactly
what you want mid-rollback.

**Local play-testing is unchanged**: `docker compose up --build` in the repo still builds from your
working tree — the compose CLI auto-merges `docker-compose.override.yml`, which carries the `build:`
block the deploy file deliberately lacks.

The compose file maps host **8080** → container **3001** and creates a named volume
`game-hub-game-data` for the SQLite database. Change the left side of `"8080:3001"` if 8080 is
already used on your NAS.

## Option B — build the image, then run a container

If you'd rather build once and deploy the image:

```bash
# On a machine with Docker + this repo checked out:
docker build -t game-hub:latest .

# Run it (persisting the DB to a named volume):
docker run -d --name game-hub \
  -p 8080:3001 \
  -v game-hub-game-data:/data \
  --restart unless-stopped \
  game-hub:latest
```

Then in Portainer, deploy a container from the `game-hub:latest` image with the same port
mapping and a volume mounted at `/data`. To move the image to the NAS without a registry:

```bash
docker save game-hub:latest | gzip > game-hub.tar.gz
# copy to the NAS, then:
docker load < game-hub.tar.gz
```

---

## Updating to a new version

Rebuild/redeploy the stack (or rebuild the image and recreate the container). Because the database
lives on the `/data` volume, **in-progress games and lobbies are preserved** across updates.

## Backups

The whole game state is one SQLite file — but the database runs in **WAL mode**, so the main
`.sqlite` file alone is *not* a complete snapshot: recent writes live in the `-wal` sidecar until a
checkpoint folds them in. Copying just the main file (`docker cp game-hub:/data/game-hub.sqlite …`)
while the server is running gives a **silently stale or torn** backup — don't do it.

Use `VACUUM INTO` instead. It writes a fresh, fully-checkpointed copy in a single atomic transaction,
is WAL-correct, and is safe to run against the live database while games are in progress (it only
reads a consistent snapshot of the source):

```bash
STAMP=$(date +%Y%m%d-%H%M%S)

# Ask the running container to write a consistent copy onto the volume. VACUUM INTO fails if the
# target already exists, so the timestamped name also stops it clobbering an earlier backup.
docker exec game-hub node -e "const D=require('better-sqlite3'); new D(process.env.DATABASE_PATH || '/data/game-hub.sqlite').exec(\"VACUUM INTO '/data/backup-$STAMP.sqlite'\")"

# Copy that single, self-contained file off the host (no -wal/-shm sidecars to worry about):
docker cp "game-hub:/data/backup-$STAMP.sqlite" "./game-hub-backup-$STAMP.sqlite"

# Optional: drop the on-volume copy once it's off the host.
docker exec game-hub rm "/data/backup-$STAMP.sqlite"
```

The resulting `game-hub-backup-*.sqlite` is a normal, standalone SQLite database. **Restore** by
stopping the container, putting it in place of `game-hub.sqlite` on the `/data` volume (remove any
stale `game-hub.sqlite-wal` / `-shm` alongside it), and starting again.

## Notes / expectations

- **No authentication.** Anyone who can reach the URL can create, join, and resume any seat. That's a
  deliberate choice for trusted home/LAN use — don't expose it to the public internet as-is.
- **One image, one port.** The UI talks to the API same-origin, so there's no CORS or proxy to configure.
- **WebSockets** work through the single port; if you put a reverse proxy in front, allow WS upgrades
  on `/games/:id/stream`.
- **Health check.** `GET /health` runs a real `SELECT 1` against the database and returns `503` if it
  can't reach it, so the healthcheck + `restart: unless-stopped` actually fire on a locked or
  unmounted volume — not just when the process dies. The **image itself** has a `HEALTHCHECK` (probing
  with Node's `fetch`, since the slim image has no curl/wget), so `docker run` users get it too; the
  compose file also declares one (identical command) for `depends_on` ordering and clarity.
- **Graceful shutdown.** The server handles `SIGTERM`/`SIGINT` (what `docker stop` and Ctrl-C send):
  it drains in-flight requests and closes the database cleanly before exiting.
