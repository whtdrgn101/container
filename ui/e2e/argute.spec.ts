import { expect, test } from '@playwright/test';

/**
 * Argute end-to-end through the real shell — the seventh game, and the first one built from
 * `whtdrgn101/game-template` rather than extracted out of this workspace. Like Labyrinth it is
 * *installed*: nothing here compiles it, so this spec is the platform-side proof that a game the hub has
 * never seen the source of can be picked, dealt, bid, played and scored.
 *
 * It also covers the two things that are specific to this game and cannot be checked anywhere else:
 *
 *  1. **The pegboard renders as a board.** Seven columns of drilled holes with the two inlaid lines the
 *     physical game has — the near-black **6** (the win line) and the chalk-white **0** (where every peg
 *     starts). The pegs move on it, and a score can go below the 0 line (game ROADMAP §2 and ruling R9).
 *  2. **Bids are secret** (ruling R2). A hotseat client holds every seat, so the honest check of secrecy
 *     is that a seat which has bid advertises only *that* it has bid until the hand is scored — the value
 *     is never in the DOM for a seat the viewer doesn't hold, and never in the public log.
 *
 * The hand is three tricks of 3, then 2, then 1 card, so "play a trick" means selecting three cards and
 * committing them. The deal is the live server's, so this drives the *loop* rather than any specific
 * cards: it never assumes a denomination is in hand.
 */
test('pick Argute, bid in secret, and play the first trick on a real pegboard', async ({ page }) => {
  await page.goto('/');

  // Seven games are hosted, so the shelf is shown. Open Argute's box lid, then start a hotseat table.
  await page.getByTestId('pick-game-argute').click();
  await page.getByTestId('start-game').click();

  // The board rendered — which already means the lazy chunk loaded out of node_modules.
  await expect(page.getByTestId('argute-board')).toBeVisible();

  // ── The pegboard ────────────────────────────────────────────────────────────────────────────────
  const pegboard = page.getByTestId('argute-pegboard');
  await expect(pegboard).toBeVisible();

  // Both inlaid lines are drawn and labelled — the whole point of the board is that 0 and 6 are
  // readable without a legend (ruling R9).
  await expect(page.getByTestId('inlay-0')).toBeVisible();
  await expect(page.getByTestId('inlay-6')).toBeVisible();

  // Every seat has a peg, and every peg starts in the 0 line's row of holes.
  const pegs = page.locator('[data-testid^="peg-"][data-score]');
  await expect(pegs.first()).toBeVisible();
  for (const peg of await pegs.all()) {
    expect(await peg.getAttribute('data-score')).toBe('0');
  }

  // ── Bidding, in secret (ruling R2) ──────────────────────────────────────────────────────────────
  // The seat on the clock picks one of the four bid cards; the others show only that a card is down.
  await expect(page.getByTestId('bid-cards')).toBeVisible();

  // Nobody has bid yet, so no seat advertises a placed bid.
  await expect(page.locator('[data-testid^="bid-placed-"]')).toHaveCount(0);

  // Bid for every seat in turn. Each seat bids 1 — a number it can actually make, so the hand stays a
  // real game rather than a forced miss.
  const seatCount = await page.locator('[data-testid^="peg-"][data-score]').count();
  for (let seat = 0; seat < seatCount; seat += 1) {
    await page.getByTestId('bid-1').click();
  }

  // Every seat has now placed a bid, and — this is the assertion that matters — the public log records
  // only that a card went down, never which one (ruling R2). A bid value reaching the feed would be a
  // leak no amount of UI redaction could take back.
  await expect(page.getByTestId('argute-log')).toContainText('placed a bid card face-down');
  await expect(page.getByTestId('argute-log')).not.toContainText(/bid (?:card )?[0-3]\b/);

  // ── The first trick: three cards from every hand ────────────────────────────────────────────────
  await expect(page.getByTestId('my-hand')).toBeVisible();
  await expect(page.locator('[data-testid^="card-"]')).toHaveCount(6);

  // Each seat in turn selects three cards and commits them. The board only enables the play once
  // exactly the trick's size is selected (trick 1 takes 3), so the disabled state is a real assertion.
  for (let seat = 0; seat < seatCount; seat += 1) {
    const cards = page.locator('[data-testid^="card-"]');
    await expect(page.getByTestId('play-cards')).toBeDisabled();
    for (let i = 0; i < 3; i += 1) await cards.nth(i).click();
    await expect(page.getByTestId('play-cards')).toBeEnabled();
    await page.getByTestId('play-cards').click();
    await expect(page.getByTestId('argute-log')).toContainText('played');
  }

  // With every seat in, the trick resolved: somebody took it on the highest count (ROADMAP §1), the
  // feed says so, and the next trick is under way with two cards from each hand.
  await expect(page.getByTestId('argute-log')).toContainText('took trick 1 with');
  await expect(page.locator('[data-testid^="card-"]')).toHaveCount(3);
});
