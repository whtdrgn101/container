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

### Environment variables

| Var             | Default                   | Notes                                        |
|-----------------|---------------------------|----------------------------------------------|
| `PORT`          | `3001`                    | Port inside the container.                   |
| `HOST`          | `0.0.0.0`                 | Leave as-is so it's reachable on your LAN.    |
| `DATABASE_PATH` | `/data/game-hub.sqlite`  | Keep it under the mounted volume.            |
| `UI_DIST`       | `/app/ui/dist`            | Where the built UI lives; don't change.      |

---

## Option A — Portainer "Stack" (recommended)

Portainer can build straight from this repo using the included `docker-compose.yml`.

1. In Portainer: **Stacks → Add stack**.
2. Name it `game-hub`.
3. Choose a build method:
   - **Repository:** point it at your Git repo URL; set the Compose path to `docker-compose.yml`.
   - **Web editor:** paste the contents of `docker-compose.yml`.
4. **Deploy the stack.** Portainer builds the image and starts the service.
5. Open `http://<your-nas-ip>:8080`.

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

The whole game state is one SQLite file. Back up the volume (or copy the file out):

```bash
docker cp game-hub:/data/game-hub.sqlite ./game-hub-backup.sqlite
```

## Notes / expectations

- **No authentication.** Anyone who can reach the URL can create, join, and resume any seat. That's a
  deliberate choice for trusted home/LAN use — don't expose it to the public internet as-is.
- **One image, one port.** The UI talks to the API same-origin, so there's no CORS or proxy to configure.
- **WebSockets** work through the single port; if you put a reverse proxy in front, allow WS upgrades
  on `/games/:id/stream`.
