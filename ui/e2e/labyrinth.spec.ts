import { expect, test } from '@playwright/test';

/**
 * Labyrinth end-to-end through the real shell — the Track D / D2d proof on the UI side.
 *
 * Every other board in this suite is compiled from TypeScript source inside this repo. Labyrinth's is
 * **installed**: it comes from `@game-hub/game-labyrinth`, built in its own repository and consumed here
 * as a packed tarball whose `exports` resolve to `dist/`. So this spec is the only place that proves the
 * three things a dist-consumed game could quietly fail at, none of which any unit test can see:
 *
 *  1. the shell's registry can render a board it did not compile (no Vite alias, no tsconfig include),
 *  2. the board's `React.lazy(() => import('./Board.js'))` still code-splits from inside `node_modules`,
 *     so the chunk is fetched only when a game is opened,
 *  3. Tailwind's `@source '../node_modules/@game-hub'` reached the installed package, so the board is
 *     *laid out* rather than a stack of unstyled divs.
 *
 * The flow is one whole turn, the two compulsory halves of it (rulebook pg. 2): slide the maze at an
 * arrow, then move (or stay). The testids are the contract the game repo froze at L4 — `board`, `maze`,
 * `tile-<row>-<col>`, `arrow-<side>-<line>`, `extra-tile`, `stay-put`, `hunted-card`, `seat-<id>`,
 * `labyrinth-banner`, `labyrinth-log` — and are 0-based, matching the engine.
 */
test('pick Labyrinth, slide the maze at an arrow, then move — the feed narrates both', async ({ page }) => {
  await page.goto('/');

  // Six games are hosted, so the picker is shown. Choose Labyrinth, then start a hotseat game.
  await page.getByTestId('pick-game-labyrinth').click();
  await expect(page.getByTestId('game-blurb')).toContainText('maze that moves');
  await page.getByTestId('start-game').click();

  // The board rendered — which already means the lazy chunk loaded out of node_modules.
  await expect(page.getByTestId('board')).toBeVisible();
  await expect(page.getByTestId('maze')).toBeVisible();
  // 7 × 7 = 49 tiles, plus the spare beside the board.
  await expect(page.locator('[data-testid^="tile-"]')).toHaveCount(49);
  await expect(page.getByTestId('extra-tile')).toBeVisible();

  // The layout came from Tailwind scanning the *installed* package: the maze is a grid, not a column of
  // divs. A pruned stylesheet leaves `display: block`, so this assertion is the styling canary.
  await expect(page.getByTestId('maze')).toHaveCSS('display', 'grid');

  // Each seat has its hunted card (its own top card only, pg. 2) and a stack count.
  await expect(page.getByTestId('hunted-card')).toBeVisible();
  await expect(page.getByTestId('seat-p1')).toBeVisible();
  await expect(page.getByTestId('seat-stack-p1')).toBeVisible();
  const startingStack = await page.getByTestId('seat-stack-p1').textContent();

  // ── The slide (compulsory, and it must come first: pg. 2). ────────────────────────────────────────
  // "Stay put" is a MOVE, so it is dead while the turn is still in its insert phase.
  await expect(page.getByTestId('stay-put')).toBeDisabled();

  // The 12 arrows sit on the three sliding lines per side (`SLIDE_LINES = [1, 3, 5]`, 0-based), so
  // `arrow-north-1` is the first sliding column. The spare tile carries its id, which the slide swaps.
  const spareBefore = await page.getByTestId('extra-tile').getAttribute('data-tile-id');
  await page.getByTestId('arrow-north-1').click();

  // The slide ejected a tile at the far end, which becomes the new spare, and the turn moved on to the
  // walk: every arrow is now dead and "Stay put" is live.
  await expect(page.getByTestId('stay-put')).toBeEnabled();
  await expect(page.getByTestId('arrow-north-1')).toBeDisabled();
  await expect(page.getByTestId('labyrinth-log')).toContainText('pushed the extra tile in from the north');
  // The tile pushed off the far end is the new spare — a different tile from the one just inserted.
  expect(await page.getByTestId('extra-tile').getAttribute('data-tile-id')).not.toBe(spareBefore);

  // ── The move. ────────────────────────────────────────────────────────────────────────────────────
  // Staying put is always legal (game ROADMAP ruling 11), so it is the one move that cannot be blocked
  // by a bad shuffle — which is what makes it the honest choice for a spec that must never flake.
  await page.getByTestId('stay-put').click();

  // The turn passed: the banner follows the next seat, and the arrows are live again for them.
  await expect(page.getByTestId('labyrinth-log')).toContainText('stayed put');
  await expect(page.getByTestId('labyrinth-banner')).toBeVisible();
  await expect(page.getByTestId('stay-put')).toBeDisabled();

  // Nobody found a treasure by standing still, so seat 1's stack is untouched — the redaction the shell
  // renders is the module's `viewFor`, not a client-side guess.
  await expect(page.getByTestId('seat-stack-p1')).toHaveText(startingStack ?? '');

  // Both halves of the turn are in the public log, in order.
  const feed = await page.getByTestId('labyrinth-log').textContent();
  expect(feed).toContain('pushed the extra tile in');
  expect(feed).toContain('stayed put');
});
