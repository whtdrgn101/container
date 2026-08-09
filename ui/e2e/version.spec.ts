import { expect, test } from '@playwright/test';

/**
 * The footer's version stamp — the one place the running build identifies itself.
 *
 * It reads `Game Hub v<version>` everywhere, and `Game Hub v<version> : <Game> v<version>` on a screen
 * that is actually playing a game. Two halves from two different places, which is why this is worth an
 * e2e rather than a unit test:
 *
 *  - the **hub** version is substituted into the bundle by Vite at build time from the root package.json
 *    (`__HUB_VERSION__`), so nothing but a real build proves the define is wired up — a mocked render
 *    would happily print the literal token;
 *  - the **game** version is baked into `registry.generated.ts` by `pnpm generate` from the package
 *    installed in `node_modules`, so this also catches the registry drifting from what is on disk.
 *
 * Deliberately matched by shape (`v<digits>.<digits>.<digits>`) rather than against pinned numbers: this
 * spec must not need editing every time a version is bumped, which is the whole point of the feature.
 */
const SEMVER = String.raw`\d+\.\d+\.\d+`;

test('the footer stamps the hub version on every screen', async ({ page }) => {
  await page.goto('/');

  const stamp = page.getByTestId('version-stamp');
  await expect(stamp).toBeVisible();
  await expect(stamp).toHaveText(new RegExp(`^Game Hub v${SEMVER}$`));

  // It survives navigation away from the shelf: the About screen is still "everywhere else".
  await page.getByTestId('about-link').click();
  await expect(page.getByTestId('about-screen')).toBeVisible();
  await expect(stamp).toHaveText(new RegExp(`^Game Hub v${SEMVER}$`));
});

test('the stamp names the game — and its version — only while one is on the table', async ({ page }) => {
  await page.goto('/');

  const stamp = page.getByTestId('version-stamp');
  // On the game's detail screen the game is *selected* but not running, so the stamp stays hub-only —
  // the game's version is a fact about the screen playing it, not about the one advertising it.
  await page.getByTestId('pick-game-argute').click();
  await expect(stamp).toHaveText(new RegExp(`^Game Hub v${SEMVER}$`));

  await page.getByTestId('start-game').click();
  await expect(page.getByTestId('argute-board')).toBeVisible();

  // Now a game is up: both halves, in the documented format. The name comes from the client the
  // registry picked, so this also pins that the two agree on which game is on the table.
  await expect(stamp).toHaveText(new RegExp(`^Game Hub v${SEMVER} : Argute v${SEMVER}$`));

  // …and leaving the table takes the game half away again. The game keeps running server-side; this is
  // about the *screen*, which is exactly the distinction the stamp is meant to draw.
  await page.getByTestId('home-link').click();
  await expect(page.getByTestId('argute-board')).toBeHidden();
  await expect(stamp).toHaveText(new RegExp(`^Game Hub v${SEMVER}$`));
});
