import { expect, test } from '@playwright/test';

/**
 * Russian Railroads end-to-end through the real shell — the RR1 proof on the UI side, and the Track D
 * pilot: a game whose board ships from its own in-workspace **package** (`@game-hub/game-russianrailroads`)
 * plugs into the same hub, picked from the landing screen's game picker.
 *
 * RR2 adds track extension, so this drives the whole slice: pick the game, take coins, then place on a
 * track-extension space (which sets a pending lock), resolve two single steps by clicking routes, and pass
 * everyone out so the round scores — with the activity feed narrating each and the score visible per player.
 */
test('pick Russian Railroads and play track extension: place, lock, two clicks, score', async ({ page }) => {
  await page.goto('/');

  // Five games are hosted, so the picker is shown. Choose Russian Railroads, then start a hotseat game.
  await page.getByTestId('pick-game-russianrailroads').click();
  await expect(page.getByTestId('game-blurb')).toContainText('worker-placement');
  await page.getByTestId('start-game').click();

  await expect(page.getByTestId('board')).toBeVisible();
  await expect(page.getByTestId('turn-info')).toContainText('Round 1');

  // The action spaces render; the take-2-coins and track spaces are present.
  await expect(page.getByTestId('rr-space-coins')).toContainText('Take 2 coins');
  await expect(page.getByTestId('rr-space-track-wood-2')).toBeVisible();
  await expect(page.getByTestId('rr-space-track-bottom')).toBeVisible();
  await expect(page.getByTestId('rr-space-coins')).toContainText('Empty');

  // The active seat takes coins, gaining 2 (feed narrates it), then the next seat is on the clock.
  await page.getByTestId('rr-place-coins').click();
  await expect(page.getByTestId('rr-occupied-coins')).toBeVisible();
  await expect(page.getByTestId('rr-log')).toContainText('+2 coins');

  // The next seat places on the 2-worker wood space → a 3-move pending lock appears and the route rows
  // become clickable. Resolve two of the three moves.
  await page.getByTestId('rr-place-track-wood-2').click();
  await expect(page.getByTestId('rr-pending')).toContainText('track move');
  await page.getByTestId('rr-build-transsiberian').click();
  await expect(page.getByTestId('rr-log')).toContainText('built wood track on transsiberian');
  await page.getByTestId('rr-build-kyiv').click();
  await page.getByTestId('rr-build-stpetersburg').click();
  // The lock is spent; the pending prompt is gone and the turn moves on.
  await expect(page.getByTestId('rr-pending')).toBeHidden();

  // Advancing the Trans-Siberian to space 2 unlocked **green** for that seat (pg. 8–9). Cycle turns until
  // that seat is on the clock with the green action space enabled, then build a green track (a new colour
  // enters at space 1). Count-agnostic: other seats have no green access, so they pass.
  await expect(async () => {
    if (await page.getByTestId('rr-place-track-green-1').isEnabled()) return;
    await page.getByTestId('rr-pass').click();
    throw new Error('not the green-capable seat yet');
  }).toPass({ timeout: 15000 });
  await page.getByTestId('rr-place-track-green-1').click();
  await expect(page.getByTestId('rr-pending')).toContainText('track move');
  // The green space grants 2 moves: green enters the Trans-Siberian on space 1 (it can't advance past this
  // seat's wood on space 2), so spend the second move entering green on another route. Both spent → lock clears.
  await page.getByTestId('rr-build-transsiberian').click();
  await expect(page.getByTestId('rr-log')).toContainText('built green track on transsiberian');
  await page.getByTestId('rr-build-kyiv').click();
  await expect(page.getByTestId('rr-pending')).toBeHidden();

  // Pass everyone out to close round 1 → the scoring phase runs and the feed narrates it. Count-agnostic:
  // keep passing the active seat until the round rolls over (the hotseat default seat count can vary).
  await expect(async () => {
    const info = await page.getByTestId('turn-info').textContent();
    if (!info?.includes('Round 2')) {
      await page.getByTestId('rr-pass').click();
      throw new Error('round not closed yet');
    }
  }).toPass({ timeout: 15000 });
  await expect(page.getByTestId('rr-log')).toContainText('scored');
  await expect(page.getByTestId('turn-info')).toContainText('Round 2');
  // Score is visible on every player card.
  await expect(page.getByTestId('rr-score-p1')).toContainText('Score:');
});

/**
 * RR4 — locomotives. Pick the game, acquire the lowest locomotive from a loco action space (which opens the
 * pending-loco lock), then place it on an empty route from the pending panel — the feed narrating both.
 */
test('acquire a locomotive and place it on a route (pg. 10–11)', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('pick-game-russianrailroads').click();
  await page.getByTestId('start-game').click();
  await expect(page.getByTestId('board')).toBeVisible();

  // The 1-worker locomotive space is present; using it acquires the lowest loco (#2) and opens the lock.
  await expect(page.getByTestId('rr-space-loco-1')).toBeVisible();
  await page.getByTestId('rr-place-loco-1').click();
  await expect(page.getByTestId('rr-pending-loco')).toContainText('Locomotive #2');
  await expect(page.getByTestId('rr-log')).toContainText('took the #2 locomotive');

  // Place it on the empty Kyiv route → the panel closes and the feed narrates the placement.
  await page.getByTestId('rr-loco-place-kyiv').click();
  await expect(page.getByTestId('rr-pending-loco')).toBeHidden();
  await expect(page.getByTestId('rr-log')).toContainText('placed the #2 on Kyiv');
});

/**
 * RR5 — industry: factories + the wrench. Pick the game, build a factory from the "loco or factory" space
 * (flipping the lowest locomotive onto the first gap of the industry track), then industrialize to advance
 * the wrench — the feed and the per-player industry track narrating both.
 */
test('build a factory and advance the wrench (pg. 12–14)', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('pick-game-russianrailroads').click();
  await page.getByTestId('start-game').click();
  await expect(page.getByTestId('board')).toBeVisible();

  // The active seat chooses "Build factory" on the 1-worker loco/factory space → the factory-build prompt.
  await expect(page.getByTestId('rr-space-loco-1')).toContainText('locomotive or factory');
  await page.getByTestId('rr-build-factory-loco-1').click();
  await expect(page.getByTestId('rr-pending-factory')).toBeVisible();

  // Build it from the lowest locomotive (#2) → it fills the leftmost gap; the feed narrates it.
  await page.getByTestId('rr-factory-place').click();
  await expect(page.getByTestId('rr-pending-factory')).toBeHidden();
  await expect(page.getByTestId('rr-log')).toContainText('built a #2 factory');

  // The turn passed; the next seat industrializes with the 1-worker space → the wrench advances.
  await page.getByTestId('rr-place-industry-1').click();
  await expect(page.getByTestId('rr-log')).toContainText('advanced the wrench');
});
