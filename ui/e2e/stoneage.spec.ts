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

  // SA1: place a worker on the forest and see the turn pass.
  await expect(page.getByTestId('sa-banner')).toContainText('Your turn');
  await page.getByTestId('place-forest-go').click();
  await expect(page.getByTestId('place-forest')).toContainText('1/7');
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
  await expect(page.getByTestId('sa-log')).toContainText('wood'); // the roll result
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
  await expect(page.getByTestId('sa-log')).toContainText('food');
});
