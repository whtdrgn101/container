# reference_materials — the rulebook PDFs (local-only, **not committed**)

The authoritative rules for every game are the manufacturer rulebook PDFs. They are **copyrighted**, so
they are **gitignored** and never committed — the ignore rule is `reference_materials/*.pdf` in the
repo-root `.gitignore`. This directory ships only this README; a fresh clone has an otherwise-empty
`reference_materials/`.

## Why this note exists

Source and docs across the repo cite these rulebooks by **page number** in comments (the non-negotiable
"read the spec before implementing a rule; cite the page" rule — see `CLAUDE.md`). Some carry
`TODO(verify)` markers against a page. A fresh clone can't resolve any of those citations until you drop
the PDFs back in here under the **exact filenames** below — that's the whole reason to write them down.

## Where each game's PDF belongs

Put each rulebook here with the filename the code and docs expect:

| Game | Filename | Edition / notes |
|------|----------|-----------------|
| **Container** (10th Anniversary) | `Container_Rulebook_v8.pdf` | |
| **Can't Stop** | `CantStopRules.pdf` | |
| **Stone Age** | `Stone_Age_-_Rules_-_Bernd_Brunnhofer.pdf` | |
| **Saint Petersburg** (1st ed.) | `SaintPetersburg2009_Rules.pdf` | 2009 printing |
| **Russian Railroads** (Ultimate ed.) | `ultimate_railroads_rulebook-v2_en.pdf` | Ultimate Railroads, EN |
| **Labyrinth** (Ravensburger) | `TheAMAZEingLabyrinth.pdf` | *The aMAZEing Labyrinth* |

## Per-game repos document their own too

Since 2026-07-31 every game lives in its **own** repository (`whtdrgn101/game-<id>`) and is consumed here
as a published `@game-hub/*` package. Each of those repos keeps its **own** `reference_materials/`
convention — the same gitignored-for-copyright arrangement — so the filename a game's own comments cite is
documented in that game's repo. This table is the hub-side view (the five originally in-workspace plus
Labyrinth); treat each game repo's note as authoritative for that game.
