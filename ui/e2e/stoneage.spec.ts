import { expect, test } from '@playwright/test';

/**
 * Stone Age bootstrap (roadmap SA0) through the real shell — the platform proof that a third game
 * registers and renders. Read-only for now; the mechanics land one stage at a time.
 */
test('pick Stone Age and see the board scaffold', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('pick-game-stoneage').click();
  await expect(page.getByTestId('game-blurb')).toContainText('worker-placement');

  await page.getByTestId('start-game').click();
  await expect(page.getByTestId('board')).toBeVisible();
  // The board's places and the player boards render from the initial setup.
  await expect(page.getByTestId('place-forest')).toBeVisible();
  await expect(page.getByTestId('place-hunt')).toBeVisible();
  await expect(page.getByTestId('player-p1')).toBeVisible();

  // SA1: place workers on the forest and see the turn pass. The count defaults to the most you can
  // place (all 5 here), so a single click fills the forest to 5/7.
  await expect(page.getByTestId('sa-banner')).toContainText('Your turn');
  await page.getByTestId('place-forest-go').click();
  await expect(page.getByTestId('place-forest')).toContainText('5/7');
});

test('SA2: reach the action phase and gather resources', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('pick-game-stoneage').click();
  await page.getByTestId('remove-player-2').click(); // 2 players → a short placement round
  await page.getByTestId('start-game').click();
  await expect(page.getByTestId('board')).toBeVisible();

  const placeAll = async (place: string) => {
    for (let i = 0; i < 4; i += 1) await page.getByTestId(`place-${place}-inc`).click(); // 1 → 5
    await page.getByTestId(`place-${place}-go`).click();
  };
  await placeAll('forest'); // Ann places 5 on the forest
  await placeAll('clayPit'); // Bob places 5 on the clay pit → both out → action phase

  await expect(page.getByTestId('sa-banner')).toContainText('gather');
  await page.getByTestId('gather-forest').click();
  // The roll opens the gather panel; showing the dice, then you take the yield.
  await expect(page.getByTestId('gather-panel')).toBeVisible();
  await expect(page.getByTestId('die-0')).toBeVisible();
  await page.getByTestId('take-gather').click();
  await expect(page.getByTestId('sa-log')).toContainText('wood'); // the taken result
});

test('SA3: hunt for food', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('pick-game-stoneage').click();
  await page.getByTestId('remove-player-2').click();
  await page.getByTestId('start-game').click();
  await expect(page.getByTestId('board')).toBeVisible();

  const placeAll = async (place: string) => {
    for (let i = 0; i < 4; i += 1) await page.getByTestId(`place-${place}-inc`).click();
    await page.getByTestId(`place-${place}-go`).click();
  };
  await placeAll('hunt'); // Ann sends 5 to the hunt
  await placeAll('forest'); // Bob to the forest → action phase

  await page.getByTestId('gather-hunt').click();
  await page.getByTestId('take-gather').click();
  await expect(page.getByTestId('sa-log')).toContainText('food');
});

test('SA4–6: use the field to raise food production', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('pick-game-stoneage').click();
  await page.getByTestId('remove-player-2').click();
  await page.getByTestId('start-game').click();
  await expect(page.getByTestId('board')).toBeVisible();

  // Ann → field (1) then hunt (rest); Bob → clay pit (all) → action phase.
  await page.getByTestId('place-field-go').click(); // Ann places 1 on the field
  for (let i = 0; i < 4; i += 1) await page.getByTestId('place-clayPit-inc').click(); // Bob
  await page.getByTestId('place-clayPit-go').click();
  for (let i = 0; i < 3; i += 1) await page.getByTestId('place-hunt-inc').click(); // Ann's remaining 4
  await page.getByTestId('place-hunt-go').click();

  // Ann uses the field — her food track goes up (the thing that was missing before).
  await expect(page.getByTestId('player-p1')).toContainText('Food track: 0');
  await page.getByTestId('use-field').click();
  await expect(page.getByTestId('player-p1')).toContainText('Food track: 1');
});

test('SA9: place a worker on a building, then pass on buying it', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('pick-game-stoneage').click();
  await page.getByTestId('remove-player-2').click();
  await page.getByTestId('start-game').click();
  await expect(page.getByTestId('board')).toBeVisible();

  // A building stack is dealt per player, showing its cost.
  await expect(page.getByTestId('place-building1')).toContainText('Cost:');

  // Ann → building 1, Bob → quarry, Ann → hunt (rest) → action phase.
  await page.getByTestId('place-building1-go').click();
  for (let i = 0; i < 4; i += 1) await page.getByTestId('place-quarry-inc').click();
  await page.getByTestId('place-quarry-go').click();
  for (let i = 0; i < 3; i += 1) await page.getByTestId('place-hunt-inc').click();
  await page.getByTestId('place-hunt-go').click();

  // Ann's worker is on building 1; with no resources yet, she passes on the purchase.
  await expect(page.getByTestId('place-building1')).toContainText('Ann');
  await page.getByTestId('decline-0').click();
  await expect(page.getByTestId('sa-log')).toContainText('passed on a building');
});

test('SA7–8: feed everyone and roll into the next round', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('pick-game-stoneage').click();
  await page.getByTestId('remove-player-2').click();
  await page.getByTestId('start-game').click();
  await expect(page.getByTestId('board')).toBeVisible();

  // A quick placement round: Ann → hunt (all), Bob → forest (all) → action phase.
  const placeAll = async (place: string) => {
    for (let i = 0; i < 4; i += 1) await page.getByTestId(`place-${place}-inc`).click();
    await page.getByTestId(`place-${place}-go`).click();
  };
  await placeAll('hunt');
  await placeAll('forest');

  // Both gather (roll then take, returning their people) → feeding phase.
  await page.getByTestId('gather-hunt').click();
  await page.getByTestId('take-gather').click(); // Ann
  await page.getByTestId('gather-forest').click();
  await page.getByTestId('take-gather').click(); // Bob
  await expect(page.getByTestId('sa-banner')).toContainText('Feeding phase');

  // Feed both players (12 starting food ≥ 5 people — no shortfall) → round 2 begins.
  await expect(page.getByTestId('feed-panel')).toContainText('Ann needs');
  await page.getByTestId('feed-go').click(); // Ann
  await expect(page.getByTestId('feed-panel')).toContainText('Bob needs'); // turn passed before the next click
  await page.getByTestId('feed-go').click(); // Bob
  await expect(page.getByTestId('turn-info')).toContainText('Round 2');
  await expect(page.getByTestId('sa-banner')).toContainText('place your people');
});

test('SA4b: spend a tool to boost a gather roll', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('pick-game-stoneage').click();
  await page.getByTestId('remove-player-2').click();
  await page.getByTestId('start-game').click();
  await expect(page.getByTestId('board')).toBeVisible();

  // Ann → tool maker (1) + forest (rest); Bob → quarry (all) → action phase.
  await page.getByTestId('place-toolMaker-go').click(); // fixed 1
  await page.getByTestId('place-quarry-go').click(); // Bob, defaults to all 5
  await page.getByTestId('place-forest-go').click(); // Ann's remaining 4 → action phase

  // Ann takes a tool, then rolls the forest — the gather panel offers the tool as a boost.
  await page.getByTestId('use-toolMaker').click();
  await page.getByTestId('gather-forest').click();
  await expect(page.getByTestId('gather-panel')).toBeVisible();
  await page.getByTestId('tool-0').click(); // add the tool to the total
  await expect(page.getByTestId('gather-panel')).toContainText('tools'); // "+ N tools" shows in the sum
  await page.getByTestId('take-gather').click();
  await expect(page.getByTestId('sa-log')).toContainText('took');
});

test('SA10: place a worker on a card, gather a resource, and buy the card', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('pick-game-stoneage').click();
  await page.getByTestId('remove-player-2').click();
  await page.getByTestId('start-game').click();
  await expect(page.getByTestId('board')).toBeVisible();

  // The card display renders with 4 slots, cheapest first.
  await expect(page.getByTestId('place-card1')).toContainText('1 res');

  // Ann → card 1 + forest (rest); Bob → quarry (all) → action phase.
  await page.getByTestId('place-card1-go').click();
  await page.getByTestId('place-quarry-go').click(); // Bob, all 5
  await page.getByTestId('place-forest-go').click(); // Ann's remaining 4

  // Ann gathers wood (≥1 from 4 dice), then pays 1 wood for card slot 0 (cost 1).
  await page.getByTestId('gather-forest').click();
  await page.getByTestId('take-gather').click();
  await page.getByTestId('card-pay-0-wood-inc').click(); // pay 1 wood
  await page.getByTestId('acquire-0').click();
  await expect(page.getByTestId('sa-log')).toContainText('took a civilization card');
});
