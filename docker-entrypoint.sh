#!/bin/sh
# Game Hub entrypoint. The runtime runs as the unprivileged `node` user (REVIEW §4.5), but a data
# volume created by an OLDER root-running image mounts in root-owned — the image's build-time chown
# never applies to a pre-existing volume, and the server then dies with SQLITE_READONLY on its first
# write (this happened: the 4.5 slimming's one missed upgrade path). So the container starts as root
# just long enough to repair /data's ownership, then drops to `node` for the actual server.
set -e

if [ "$(id -u)" = "0" ]; then
  # Cheap even on every boot: /data holds a handful of SQLite files.
  chown -R node:node /data 2>/dev/null || true
  # Drop privileges. setpriv ships in bookworm's util-linux; --init-groups resets supplementary groups.
  exec setpriv --reuid node --regid node --init-groups "$@"
fi

# Already unprivileged (e.g. `docker run --user node`): just run.
exec "$@"
