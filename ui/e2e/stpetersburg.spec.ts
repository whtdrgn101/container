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

test('SP3: add a card to hand, then play it in a later phase — the slot empties, the feed narrates, the cost is charged', async ({
  page,
}) => {
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

/**
 * SP4 — a full trading-card displacement through the real UI. The deck is server-shuffled (the e2e backend
 * shares one in-memory DB across parallel specs, so per-game seeding is impossible), so this drives greedily,
 * reading the live game over the API to pick moves. It grabs a blue/orange trading card into hand (free)
 * while securing a building + aristocrat as displacement targets, then — once income makes it affordable —
 * plays the held trading card by displacement in the UI and asserts the swap + the "upgraded …" feed line.
 */
test('SP4: play a trading card by displacement — the play area swaps and the feed narrates the upgrade', async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);

  type SpCard = {
    id: string;
    key: string;
    kind: string;
    name: string;
    cost: number;
    ware?: string;
    tradingGroup?: 'worker' | 'building' | 'aristocrat';
    special?: string;
  };
  type SpView = {
    activePlayerIndex: number;
    round: number;
    players: {
      id: string;
      rubles: number | null;
      hand: SpCard[] | null;
      playArea: { worker: SpCard[]; building: SpCard[]; aristocrat: SpCard[] };
    }[];
    board: { upper: SpCard[]; lower: SpCard[]; discard: number };
  };
  const placedCount = (pa: SpView['players'][number]['playArea']) =>
    pa.worker.length + pa.building.length + pa.aristocrat.length;

  /** The already-placed cards a trading card may displace (pg. 7) — colour group, ware match for green. */
  const targetsFor = (owned: SpView['players'][number]['playArea'], tc: SpCard): SpCard[] => {
    const group = tc.tradingGroup!;
    return owned[group].filter((t) => {
      if (t.kind === 'trading') return false;
      if (tc.tradingGroup !== 'worker') return true;
      return t.key === 'czarCarpenter' || t.ware === tc.ware;
    });
  };

  await page.goto('/');
  await page.getByTestId('pick-game-stpetersburg').click();
  await page.getByTestId('remove-player-2').click(); // 2-seat game (Ann, Bob)
  await page.getByTestId('start-game').click();
  await expect(page.getByTestId('board')).toBeVisible();

  const gameId = await page.locator('[data-game-id]').first().getAttribute('data-game-id');
  expect(gameId).toBeTruthy();

  const readAs = async (seat: string): Promise<SpView> => {
    const res = await request.get(`/api/games/${gameId}?viewer=${seat}`);
    return (await res.json()).game as SpView;
  };
  const has = async (testId: string) => (await page.getByTestId(testId).count()) > 0;
  const enabled = async (testId: string) => (await has(testId)) && (await page.getByTestId(testId).first().isEnabled());
  // The controls are ready when Pass is enabled OR an SP5 interlude prompt is showing (which hides Pass).
  const settle = () =>
    expect(async () => {
      const passReady = await page
        .getByTestId('sp-pass')
        .isEnabled()
        .catch(() => false);
      const prompt = (await has('sp-pub-prompt')) || (await has('sp-observatory-prompt'));
      expect(passReady || prompt).toBe(true);
    }).toPass({ timeout: 20_000 });
  // If an SP5 interlude blocks play (a Pub window / a pending Observatory draw), resolve it so the
  // displacement hunt can continue — this exercises the SP5 UI prompts through the real board. It declines
  // the Pub (points 0, to preserve money for the upgrade) and discards a drawn card; the *paying* Pub-buy
  // and Observatory-resolve paths are proven deterministically at the engine (100%) and backend levels.
  const clearInterlude = async () => {
    if (await has('sp-pub-prompt')) {
      await page.getByTestId('sp-pub-buy-0').click();
      await settle();
      return true;
    }
    if (await has('sp-observatory-prompt')) {
      await page.getByTestId('sp-observatory-discard').click();
      await settle();
      return true;
    }
    return false;
  };

  let upgraded = false;
  for (let step = 0; step < 400 && !upgraded; step += 1) {
    if (await clearInterlude()) continue;
    // The board follows the active seat (hotseat); read that seat's own view (its rubles + hand visible).
    const cursor = await readAs('p1');
    const seat = cursor.players[cursor.activePlayerIndex]!.id;
    const view = await readAs(seat);
    const me = view.players.find((p) => p.id === seat)!;
    const hand = me.hand ?? [];
    const rowCards = [...view.board.upper, ...view.board.lower];

    // P1 — a held trading card that is playable-by-displacement right now (the UI enables its sp-play button
    // exactly when the seat can afford the difference). Prefer the cheapest so it fires as early as possible.
    const playableIdx = hand
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => c.kind === 'trading' && targetsFor(me.playArea, c).length > 0)
      .sort((a, b) => a.c.cost - b.c.cost);
    let playedCard: SpCard | undefined;
    for (const { c, i } of playableIdx) {
      if (await enabled(`sp-play-${i}`)) {
        await page.getByTestId(`sp-play-${i}`).first().click();
        // A single affordable target acts at once; several open the displacement picker (which lists only
        // targets the seat can pay to displace). Wait for the picker to render — a short timeout distinguishes
        // the immediate-play case — then click whichever target *button* it offers (not the container/cancel).
        try {
          const pickerBox = page.getByTestId('sp-displace-picker');
          await pickerBox.waitFor({ state: 'visible', timeout: 2000 });
          await pickerBox
            .locator('button[data-testid^="sp-displace-"]:not([data-testid="sp-displace-cancel"])')
            .first()
            .click();
        } catch {
          // No picker appeared → a single legal target, already played.
        }
        playedCard = c;
        break;
      }
    }
    if (playedCard) {
      await settle();
      // The upgrade landed (pg. 7): the feed narrates it, the trading card is now placed, the discard grew
      // by exactly one, and the play-area count is unchanged (one card in, its displaced partner out).
      await expect(page.getByTestId('sp-log')).toContainText('upgraded');
      const after = await readAs(seat);
      const mine = after.players.find((p) => p.id === seat)!;
      const all = [...mine.playArea.worker, ...mine.playArea.building, ...mine.playArea.aristocrat];
      expect(all.some((c) => c.id === playedCard!.id)).toBe(true); // the trading card is now placed
      expect(placedCount(mine.playArea)).toBe(placedCount(me.playArea)); // net zero: one in, one displaced out
      expect(after.board.discard).toBe(view.board.discard + 1); // the displaced card went to the discard
      upgraded = true;
      break;
    }

    let acted = false;

    // Do we already hold a blue/orange trading card whose displacement target we own? If so — and we have an
    // income source (worker/aristocrat) so money will keep growing — stop spending and just pass: income
    // accrues each round until P1's play becomes affordable. This converges fast and avoids draining money.
    const readyToWait =
      hand.some(
        (c) =>
          c.kind === 'trading' &&
          (c.tradingGroup === 'building' || c.tradingGroup === 'aristocrat') &&
          targetsFor(me.playArea, c).length > 0,
      ) &&
      (me.playArea.worker.length > 0 || me.playArea.aristocrat.length > 0);

    // P2 — grab a blue/orange trading card into hand (free) while there's room, so a placed building/
    // aristocrat can be upgraded once we can afford the difference. Prefer the cheapest to shorten the wait.
    if (!readyToWait) {
      const grabbable = rowCards
        .filter((c) => c.kind === 'trading' && (c.tradingGroup === 'building' || c.tradingGroup === 'aristocrat'))
        .sort((a, b) => a.cost - b.cost);
      for (const c of grabbable) {
        if (await has(`sp-hand-${c.id}`)) {
          await page.getByTestId(`sp-hand-${c.id}`).first().click();
          acted = true;
          break;
        }
      }
    }

    // P3 — otherwise buy the cheapest affordable non-trading, **non-special** card. Until we hold a ready
    // trading card, taking a card every turn keeps the pg. 8 mid-round refills firing (so fresh trading
    // cards keep flowing) and stocks displacement targets + income; once ready, we stop buying (readyToWait)
    // so money can build. Special buildings (Pub/Observatory) are skipped — this spec targets displacement,
    // not the SP5 interludes (which have deterministic engine/backend coverage), so it never triggers one.
    if (!acted && !readyToWait) {
      for (const c of [...rowCards].filter((x) => x.kind !== 'trading' && !x.special).sort((a, b) => a.cost - b.cost)) {
        if (await has(`sp-buy-${c.id}`)) {
          await page.getByTestId(`sp-buy-${c.id}`).first().click();
          acted = true;
          break;
        }
      }
    }

    // P4 — nothing affordable/available (or waiting for income): pass to advance the phase and accrue income
    // card becomes playable.
    if (!acted) await page.getByTestId('sp-pass').click();
    await settle();
  }

  expect(upgraded).toBe(true);
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

test('SP6: an ended game renders the final-scoring results screen (GameOver)', async ({ page, request }) => {
  // Driving a whole Saint Petersburg game to its end through the UI is long and shuffle-dependent, so — per
  // the roadmap's caveat (no flaky specs) — we reach the end DETERMINISTICALLY over HTTP: an all-pass game
  // empties the worker stack after a fixed number of rollovers regardless of the deck order (the round-end
  // worker deal is unconditional, pg. 5), so the trigger→final-round→ended sequence is reproducible without
  // depending on the shuffle. We then LOAD that ended game in the real UI by code and assert the shared
  // GameOver frame + the per-player breakdown render (the SP6 results screen).
  const created = await request.post('/api/games', {
    data: { gameType: 'stpetersburg', players: [{ name: 'Ann' }, { name: 'Bob' }] },
  });
  expect(created.ok()).toBeTruthy();
  const gameId = (await created.json()).game.id as string;

  type S = { status: string; activePlayerIndex: number; players: { id: string }[] };
  let state = (await (await request.get(`/api/games/${gameId}`)).json()).game as S;
  for (let i = 0; i < 400 && state.status !== 'ended'; i += 1) {
    const seat = state.players[state.activePlayerIndex]!.id;
    const res = await request.post(`/api/games/${gameId}/actions`, {
      data: { playerId: seat, action: { type: 'PASS' } },
    });
    state = (await res.json()).game as S;
  }
  expect(state.status).toBe('ended');

  // Load the ended game in the UI by its code (a bare game id → getGame, controlling every seat).
  await page.goto('/');
  await page.getByTestId('join-code').fill(gameId);
  await page.getByTestId('join-game').click();

  await expect(page.getByTestId('board')).toBeVisible();
  // The shared end-of-game frame with the winner(s).
  await expect(page.getByTestId('results')).toBeVisible();
  await expect(page.getByTestId('winner')).toContainText('win');
  // Saint Petersburg's own final-scoring breakdown table (base / aristocrats / money / hand / total).
  await expect(page.getByTestId('sp-results')).toBeVisible();
  await expect(page.getByTestId('sp-result-p1')).toBeVisible();
  await expect(page.getByTestId('sp-result-p2')).toBeVisible();
  // Affordances are gone at ended — no Pass control on an over game.
  await expect(page.getByTestId('sp-pass')).toHaveCount(0);
});
