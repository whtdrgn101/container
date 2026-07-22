import { expect, test } from '@playwright/test';

/**
 * Saint Petersburg bootstrap (roadmap SP0) through the real shell — the platform proof that a **fourth**
 * game registers and renders. Read-only for now; the action phases land one slice at a time (SP1+).
 */
test('pick Saint Petersburg and see the read-only board scaffold', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('pick-game-stpetersburg').click();
  await expect(page.getByTestId('game-blurb')).toContainText('card-buying');

  // Hotseat quick-start deals the minimum (2 players: Ann, Bob).
  await page.getByTestId('start-game').click();
  await expect(page.getByTestId('board')).toBeVisible();

  // The two card rows render — the upper seeded with workers, the lower empty in round 1.
  await expect(page.getByTestId('sp-upper-row')).toBeVisible();
  await expect(page.getByTestId('sp-lower-row')).toContainText('empty');

  // The four draw stacks render as counts, with the worker stack shown for the opening worker phase.
  await expect(page.getByTestId('sp-stack-worker')).toContainText('left');
  await expect(page.getByTestId('sp-stack-building')).toContainText('28 left');
  await expect(page.getByTestId('sp-phase-worker')).toHaveAttribute('aria-current', 'step');

  // Both players' panels render.
  await expect(page.getByTestId('player-p1')).toBeVisible();
  await expect(page.getByTestId('player-p2')).toBeVisible();
  await expect(page.getByTestId('turn-info')).toContainText('Round 1');
});

test('opponents’ rubles are hidden; the active seat sees its own', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('pick-game-stpetersburg').click();
  await page.getByTestId('start-game').click();
  await expect(page.getByTestId('board')).toBeVisible();

  // Hotseat follows the active seat: exactly one player (the active one) reveals its rubles; every other
  // seat's rubles are locked (the game's secret). Asserted seat-count-agnostically — the hotseat player
  // count carries over from the landing, and which seat is active is dealt by the server's rng.
  await expect(page.locator('[data-testid^="sp-rubles-p"]')).toHaveCount(1); // only the active seat shown
  await expect(page.locator('[data-testid^="sp-rubles-hidden-"]').first()).toBeVisible(); // opponents locked
  await expect(page.getByText('25₽')).toBeVisible(); // the active seat's own rubles at setup
});

test('SP1: buy a worker, pass around, and the worker phase scores and refills', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('pick-game-stpetersburg').click();
  await page.getByTestId('remove-player-2').click(); // trim the hotseat to a 2-seat game (Ann, Bob)
  await page.getByTestId('start-game').click();
  await expect(page.getByTestId('board')).toBeVisible();

  // The upper row seeds 4 affordable workers (2-player seed); the active seat buys one.
  const upperBuys = page.getByTestId('sp-upper-row').locator('[data-testid^="sp-buy-"]');
  await expect(upperBuys).toHaveCount(4);
  await upperBuys.first().click();

  // The bought card left its slot (rows compact), and a worker shows in a play area; the feed narrates it.
  await expect(page.getByTestId('sp-upper-row').locator('[data-testid^="sp-buy-"]')).toHaveCount(3);
  await expect(page.getByText('Workers: 1').first()).toBeVisible();
  await expect(page.getByTestId('sp-log')).toContainText('bought');

  // Both seats pass consecutively → the worker phase's actions end (sp-pass disables while busy, so the
  // clicks serialize as the turn advances around the table).
  await page.getByTestId('sp-pass').click();
  await page.getByTestId('sp-pass').click();

  // Scored + advanced to the building phase; the refill dealt buildings into the upper row.
  await expect(page.getByTestId('sp-phase-building')).toHaveAttribute('aria-current', 'step');
  await expect(page.getByTestId('sp-stack-building')).not.toContainText('28 left');
  await expect(page.getByTestId('sp-log')).toContainText('worker phase scored');
  // The now-active seat's own rubles are visible, reflecting worker scoring.
  await expect(page.locator('[data-testid^="sp-rubles-p"]').first()).toBeVisible();
});

test('SP2: drive a full round (mostly passes) into round 2 — the round transition', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('pick-game-stpetersburg').click();
  await page.getByTestId('remove-player-2').click(); // 2-seat game (Ann, Bob)
  await page.getByTestId('start-game').click();
  await expect(page.getByTestId('board')).toBeVisible();
  await expect(page.getByTestId('turn-info')).toContainText('Round 1');

  // Exactly one seat holds the worker-phase starting-player marker (a marker chip renders on its panel).
  await expect(page.locator('[data-testid^="sp-marker-worker-"]')).toHaveCount(1);

  // Buy one worker so the worker phase refills (a card is taken), then pass the rest of the round out:
  // two consecutive passes close each of the four phases (2-player), and the trading close rolls the round.
  await page.getByTestId('sp-upper-row').locator('[data-testid^="sp-buy-"]').first().click();
  for (let i = 0; i < 8; i += 1) {
    await page.getByTestId('sp-pass').click();
  }

  // Round 2 has begun in the worker phase, and the feed narrated the rollover.
  await expect(page.getByTestId('turn-info')).toContainText('Round 2');
  await expect(page.getByTestId('sp-phase-worker')).toHaveAttribute('aria-current', 'step');
  await expect(page.getByTestId('sp-log')).toContainText('markers passed left');

  // The round-1 rows slid down: the board holds 8 across both rows (the round-end worker deal is
  // unconditional — pg. 5; here the 8 slid cards already fill it, so the upper row shows empty) and the
  // lower row holds the slid cards (buyable at −1, so buttons). The board must never drain (drain-spiral fix).
  await expect(page.getByTestId('sp-upper-row')).toContainText('empty');
  await expect(page.getByTestId('sp-lower-row').locator('[data-testid^="sp-buy-"]').first()).toBeVisible();
});

test('SP3: add a card to hand, then play it in a later phase — the slot empties, the feed narrates, the cost is charged', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('pick-game-stpetersburg').click();
  await page.getByTestId('remove-player-2').click(); // 2-seat game (Ann, Bob)
  await page.getByTestId('start-game').click();
  await expect(page.getByTestId('board')).toBeVisible();

  // Each of the 4 upper-row cards carries a free "+ Hand" affordance beside its Buy. The active seat adds one.
  const addButtons = page.getByTestId('sp-upper-row').locator('[data-testid^="sp-hand-"]');
  await expect(addButtons).toHaveCount(4);
  await addButtons.first().click();

  // The taken card left the row (4 → 3 buyable), and the feed NAMES the take (public at the table, pg. 3).
  await expect(page.getByTestId('sp-upper-row').locator('[data-testid^="sp-buy-"]')).toHaveCount(3);
  await expect(page.getByTestId('sp-log')).toContainText('into hand');

  // Close the worker phase (two consecutive passes) and land in the building phase — a genuinely later
  // phase — while the added card stays in hand.
  await page.getByTestId('sp-pass').click();
  await page.getByTestId('sp-pass').click();
  await expect(page.getByTestId('sp-phase-building')).toHaveAttribute('aria-current', 'step');

  // A play button appears only for the active hand-holder; in hotseat one pass flips the active seat.
  if ((await page.getByTestId('sp-play-0').count()) === 0) {
    await page.getByTestId('sp-pass').click();
  }
  await expect(page.getByTestId('sp-play-0')).toBeVisible();

  // Play the held card — it moves into the play area and the feed narrates the cost charged.
  await page.getByTestId('sp-play-0').click();
  await expect(page.getByTestId('sp-log')).toContainText('from hand');
  await expect(page.getByTestId('sp-play-0')).toHaveCount(0); // the card left the hand
});

test('SP3: the hand limit (3) blocks a 4th add', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('pick-game-stpetersburg').click();
  await page.getByTestId('remove-player-2').click(); // 2-seat game (Ann, Bob)
  await page.getByTestId('start-game').click();
  await expect(page.getByTestId('board')).toBeVisible();

  // The active seat adds three cards, handing the turn back through the other seat each time (a pass keeps
  // the phase open). The "+ Hand" affordance persists while under the limit.
  for (let i = 0; i < 3; i += 1) {
    await page.getByTestId('sp-upper-row').locator('[data-testid^="sp-hand-"]').first().click();
    await page.getByTestId('sp-pass').click(); // return the turn to the adder without closing the phase
  }

  // The hand now holds 3 cards (three play buttons) and — at the limit — NO "+ Hand" affordance remains.
  await expect(page.locator('[data-testid^="sp-play-"]')).toHaveCount(3);
  await expect(page.getByTestId('sp-upper-row').locator('[data-testid^="sp-hand-"]')).toHaveCount(0);
});
