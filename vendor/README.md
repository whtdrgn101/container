# `vendor/` — the packed Labyrinth game package

This directory holds one file: a `pnpm pack` tarball of **`@game-hub/game-labyrinth`**, the first game
hosted from outside this monorepo (Track D / D2c–D2d; the game lives at
<https://github.com/whtdrgn101/game-labyrinth>).

**The tarball is committed on purpose. It _is_ the dependency.** `backend/package.json` and
`ui/package.json` both depend on it as `"@game-hub/game-labyrinth": "file:../vendor/<tarball>"`, so it
has to be present in a fresh clone for `pnpm install --frozen-lockfile` to succeed — which is exactly
what the Dockerfile runs. A `.gitignore`d tarball would build on your machine and fail in CI and in
`docker compose up --build`, which is the failure mode this file exists to prevent.

> The `../` in the specifier is not a typo. pnpm resolves a `file:` dependency relative to the package
> that _declares_ it, so a manifest in `backend/` or `ui/` has to climb out to reach the repo-root
> `vendor/`.

## Why a tarball and not a git dependency, a path dependency, or npm

|                              |                                                                                                                                                                              |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `link:`/`file:` to a sibling checkout | Would make the hub un-buildable for anyone who hasn't cloned the game repo to exactly the right path — and un-buildable inside Docker, where only this repo's tree is copied in. |
| a `git:` dependency          | pnpm would have to clone and **build** it at install time; the game ships `dist/` from a `prepack`, and the Dockerfile's install step has no git and no network guarantee.       |
| npm                          | The right answer, and the plan — see below. It just hasn't happened yet.                                                                                                        |

A packed tarball is the only form that is self-contained, byte-identical everywhere, integrity-hashed in
the lockfile, and installable offline inside the image.

## The loop: changing the game and seeing it in the hub

One command, from the hub root:

```bash
pnpm labyrinth:refresh          # expects ../game-labyrinth; set LABYRINTH_REPO to point elsewhere
```

It packs the game (its `prepack` runs the `tsc` build, so `dist/` is always current), drops the tarball
here, deletes the superseded one, rewrites the `file:` specifier in both hosts if the version changed, and
runs `pnpm install`. **Commit the tarball, the two `package.json` files and `pnpm-lock.yaml` together** —
the lockfile carries the tarball's integrity hash, and `--frozen-lockfile` inside Docker will reject the
three if they disagree.

Then the usual: `pnpm dev:backend` + `pnpm dev:ui`, or `docker compose up --build`.

## What replaces this

Publishing `@game-hub/game-labyrinth` to npm (it already has `files`, `publishConfig` and a `prepack`
build, and a `pack:smoke` CI job proving the tarball installs and plays outside its own repo). On the day
that happens:

1. `pnpm --filter @game-hub/backend --filter @game-hub/ui add @game-hub/game-labyrinth@^0.1.0`
2. delete this directory and `scripts/labyrinth-refresh.mjs`
3. drop the `labyrinth:refresh` line from the root `package.json` and from `CLAUDE.md`

Nothing else changes: `games.config.ts`, the generated registries, the Tailwind `@source` glob and both
hosts already treat this game as an ordinary installed package. That is the point of D2d — the vendoring
is a **distribution** detail, not an architectural one.
