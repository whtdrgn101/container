# e2e tests (Playwright)

`playwright test` drives real user flows against the API + UI dev servers (Playwright starts both — see
`../playwright.config.ts`). Run locally with `pnpm test:e2e` from the repo root.

## Visual-regression baselines

`visual.spec.ts` screenshots the board minimap and compares it to a committed baseline. Playwright keys
baselines on **platform**, so there is one PNG per project *per OS* in `visual.spec.ts-snapshots/`
(`…-darwin.png`, `…-linux.png`). CI compares against the **Linux** baselines.

⚠️ **Rendering must match the environment the baseline was generated in.** CI runs the e2e suite inside
the pinned Playwright container `mcr.microsoft.com/playwright:v1.61.1-jammy`, and the committed `-linux`
baselines were generated in that same image — so they match bit-for-bit. **Regenerate the Linux
baselines in that container, never on a bare host**, or a font-rendering difference will make CI red.

To regenerate after an intentional board-art change (run from the repo root):

```bash
docker rm -f pw-gen 2>/dev/null || true
docker run --name pw-gen -v "$PWD":/src:ro -e CI=1 \
  mcr.microsoft.com/playwright:v1.61.1-jammy bash -c '
    set -e
    apt-get update >/dev/null && apt-get install -y --no-install-recommends python3 make g++ >/dev/null
    git config --global --add safe.directory /src
    mkdir -p /work && cd /src && git ls-files -z ":!:.claude/**" \
      | tar --null --files-from=- -cf - | tar -xf - -C /work
    cd /work
    corepack enable && corepack prepare pnpm@11.13.0 --activate
    pnpm install --frozen-lockfile
    pnpm --filter @game-hub/ui exec playwright test e2e/visual.spec.ts --update-snapshots
  '
docker cp pw-gen:/work/ui/e2e/visual.spec.ts-snapshots/. ui/e2e/visual.spec.ts-snapshots/
docker rm -f pw-gen
```

The pinned image tag must equal the installed `@playwright/test` version (currently **1.61.1**); bump
both together. The `-darwin` baselines are kept for contributors who run e2e on macOS; regenerate them
there with `pnpm test:e2e --update-snapshots` if the art changes.
