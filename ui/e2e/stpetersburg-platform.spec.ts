import { expect, test } from '@playwright/test';

/**
 * SP7 — the platform features work for Saint Petersburg, proven through the real shell. These are
 * game-agnostic platform wins (lobby, colour-picking, resume, abandon) that every game gets for free —
 * but "for free" is a claim, so a fourth game exercises them end-to-end just like the other three.
 *
 * ⚠️ The Playwright backend shares one `:memory:` database across the whole run, so `GET /games` and
 * `GET /lobbies` surface rows from other specs. Every locator here is scoped to **this** spec's own
 * game/lobby id (never a count of rows), per the CLAUDE.md caveat.
 */

/** Trim the landing's seat-count picker down to `n` (Saint Petersburg's minimum is 2). */
async function setSeats(page: import('@playwright/test').Page, n: number) {
  while ((await page.getByTestId('seat-count').textContent())?.trim() !== String(n)) {
    await page.getByTestId('seats-dec').click();
  }
}

test('lobby: two players join a shared Saint Petersburg game with picked colours, and each sees their own seat', async ({
  browser,
}) => {
  const hostCtx = await browser.newContext();
  const guestCtx = await browser.newContext();
  const host = await hostCtx.newPage();
  const guest = await guestCtx.newPage();

  // Host makes a 2-seat Saint Petersburg lobby and claims seat 0 as Ann, picking blue.
  await host.goto('/');
  await host.getByTestId('pick-game-stpetersburg').click();
  await host.getByTestId('mode-online').click();
  await setSeats(host, 2);
  await host.getByTestId('create-lobby').click();
  await expect(host.getByTestId('lobby')).toBeVisible();
  const code = await host.getByTestId('lobby-code').getAttribute('data-lobby-id');
  expect(code).toBeTruthy();

  await host.getByTestId('seat-name').fill('Ann');
  await host.getByTestId('take-seat').click();
  await expect(host.getByTestId('lobby-seat-0')).toContainText('Ann');
  // Saint Petersburg's palette is blue/yellow/green/red (its four wood-figure colours).
  await host.getByTestId('color-pick-0-blue').click();
  await expect(host.getByTestId('color-pick-0-blue')).toHaveAttribute('aria-pressed', 'true');

  // Guest joins by code, claims seat 1 as Bob, and picks yellow. Blue (Ann's) is disabled in its row.
  await guest.goto('/');
  await guest.getByTestId('join-code').fill(code!);
  await guest.getByTestId('join-game').click();
  await expect(guest.getByTestId('lobby')).toBeVisible();
  await expect(guest.getByTestId('lobby-seat-0')).toContainText('Ann');
  await guest.getByTestId('seat-name').fill('Bob');
  await guest.getByTestId('take-seat').click();
  await expect(guest.getByTestId('lobby-seat-1')).toContainText('Bob');
  await expect(guest.getByTestId('color-pick-1-blue')).toBeDisabled(); // uniqueness enforced live
  await guest.getByTestId('color-pick-1-yellow').click();
  await expect(guest.getByTestId('color-pick-1-yellow')).toHaveAttribute('aria-pressed', 'true');

  // Host sees the table fill and starts.
  await expect(host.getByTestId('lobby-seat-1')).toContainText('Bob');
  await expect(host.getByTestId('start-lobby')).toBeEnabled();
  await host.getByTestId('start-lobby').click();

  // Both land on the board bound to their own seat, and the picked colours are reflected on both boards.
  await expect(host.getByTestId('board')).toBeVisible();
  await expect(guest.getByTestId('board')).toBeVisible();
  await expect(host.getByTestId('sp-banner')).toContainText('You are Ann');
  await expect(guest.getByTestId('sp-banner')).toContainText('You are Bob');
  for (const view of [host, guest]) {
    await expect(view.getByTestId('seat-legend-p1')).toHaveAttribute('data-color', 'blue');
    await expect(view.getByTestId('seat-legend-p2')).toHaveAttribute('data-color', 'yellow');
  }

  await hostCtx.close();
  await guestCtx.close();
});

test('resume: rejoin an in-progress Saint Petersburg game by seat — own rubles visible, opponent’s hidden', async ({
  browser,
}) => {
  const firstCtx = await browser.newContext();
  const secondCtx = await browser.newContext();
  const starter = await firstCtx.newPage();
  const returner = await secondCtx.newPage();

  // Start a 2-seat hotseat Saint Petersburg game (Ann, Bob) and grab its id.
  await starter.goto('/');
  await starter.getByTestId('pick-game-stpetersburg').click();
  await starter.getByTestId('remove-player-2').click(); // trim to 2 seats
  await starter.getByTestId('start-game').click();
  await expect(starter.getByTestId('board')).toBeVisible();
  const code = await starter.getByTestId('game-code').getAttribute('data-game-id');
  expect(code).toBeTruthy();

  // A returning player finds it on the home screen and resumes as Bob (seat p2).
  await returner.goto('/');
  const row = returner.getByTestId(`active-game-${code}`);
  await expect(row).toBeVisible();
  await expect(returner.getByTestId(`active-game-type-${code}`)).toHaveText('Saint Petersburg');
  await returner.getByTestId(`resume-${code}-p2`).click();

  // Bound to Bob's seat: own rubles are shown, Ann's are the game's secret (locked).
  await expect(returner.getByTestId('board')).toBeVisible();
  await expect(returner.getByTestId('sp-banner')).toContainText('You are Bob');
  await expect(returner.getByTestId('sp-rubles-p2')).toBeVisible(); // own rubles (a number)
  await expect(returner.getByTestId('sp-rubles-hidden-p1')).toBeVisible(); // opponent's redacted

  await firstCtx.close();
  await secondCtx.close();
});

test('abandon: a soft-deleted Saint Petersburg game is readable but refuses to be played', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await page.getByTestId('pick-game-stpetersburg').click();
  await page.getByTestId('remove-player-2').click(); // 2-seat game
  await page.getByTestId('start-game').click();
  await expect(page.getByTestId('board')).toBeVisible();
  const code = await page.getByTestId('game-code').getAttribute('data-game-id');

  const abandon = await request.post(`/api/games/${code}/abandon`);
  expect(abandon.ok()).toBeTruthy();

  // Still readable — soft delete, not a hard delete.
  const read = await request.get(`/api/games/${code}`);
  expect(read.ok()).toBeTruthy();
  expect((await read.json()).abandoned).toBe(true);

  // But it refuses to move: 409 GAME_ABANDONED (the game exists, so never a 404).
  const move = await request.post(`/api/games/${code}/actions`, {
    data: { playerId: 'p1', action: { type: 'PASS' } },
  });
  expect(move.status()).toBe(409);
  expect((await move.json()).error.code).toBe('GAME_ABANDONED');
});
