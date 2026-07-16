import { expect, test } from '@playwright/test';

/**
 * Abandoning closes out a game nobody intends to finish, so the home screen stops offering it.
 *
 * ⚠️ The Playwright backend shares one `:memory:` database across the whole run, so `GET /games`
 * surfaces games from other specs. Every locator here is scoped to **this** spec's own game id —
 * never a count of rows under `active-games`, which other specs change underneath us.
 */
test('abandon an in-progress game from the home screen', async ({ page }) => {
  // Start a game (Ann/Bob/Cid) and grab its id, then head home — the game persists server-side.
  await page.goto('/');
  await page.getByTestId('start-game').click();
  await expect(page.getByTestId('board')).toBeVisible();
  const code = await page.getByTestId('game-code').getAttribute('data-game-id');
  expect(code).toBeTruthy();

  await page.getByTestId('home-link').click();
  const row = page.getByTestId(`active-game-${code}`);
  await expect(row).toBeVisible();

  // Abandoning takes two clicks: it acts on everyone's game, so it asks first.
  await page.getByTestId(`abandon-${code}`).click();
  await expect(page.getByTestId(`abandon-confirm-${code}`)).toBeVisible();

  // Backing out leaves the game exactly where it was.
  await page.getByTestId(`abandon-no-${code}`).click();
  await expect(page.getByTestId(`abandon-confirm-${code}`)).toHaveCount(0);
  await expect(row).toBeVisible();

  // Going through with it drops the game from the list, and it stays gone across a reload
  // (i.e. the server really abandoned it — this isn't just local state).
  await page.getByTestId(`abandon-${code}`).click();
  await page.getByTestId(`abandon-yes-${code}`).click();
  await expect(row).toHaveCount(0);

  await page.reload();
  await expect(page.getByTestId(`active-game-${code}`)).toHaveCount(0);
});

/** An abandoned game is soft-deleted: still readable by anyone holding a link, but out of play. */
test('an abandoned game can no longer be played', async ({ page, request }) => {
  await page.goto('/');
  await page.getByTestId('start-game').click();
  await expect(page.getByTestId('board')).toBeVisible();
  const code = await page.getByTestId('game-code').getAttribute('data-game-id');

  const abandon = await request.post(`/api/games/${code}/abandon`);
  expect(abandon.ok()).toBeTruthy();

  // The game still resolves — it wasn't deleted, it was closed out.
  const read = await request.get(`/api/games/${code}`);
  expect(read.ok()).toBeTruthy();
  expect((await read.json()).abandoned).toBe(true);

  // But it refuses to move: 409, not 404.
  const move = await request.post(`/api/games/${code}/actions`, {
    data: { playerId: 'p1', action: { type: 'END_TURN' } },
  });
  expect(move.status()).toBe(409);
  expect((await move.json()).error.code).toBe('GAME_ABANDONED');
});
