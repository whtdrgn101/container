import { expect, test, type Page } from '@playwright/test';

async function startGame(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByTestId('pick-game-container').click();
  await page.getByTestId('start-game').click();
  await expect(page.getByTestId('board')).toBeVisible();
}

test('player cards stack on mobile and lay out in a row on desktop', async ({ page }) => {
  await startGame(page);
  const card1 = page.getByTestId('player-card-p1');
  const card2 = page.getByTestId('player-card-p2');

  // Mobile width → single column: same x, card 2 below card 1.
  await page.setViewportSize({ width: 375, height: 800 });
  const mobile1 = await card1.boundingBox();
  const mobile2 = await card2.boundingBox();
  expect(mobile1).not.toBeNull();
  expect(mobile2).not.toBeNull();
  expect(Math.abs(mobile1!.x - mobile2!.x)).toBeLessThan(2);
  expect(mobile2!.y).toBeGreaterThanOrEqual(mobile1!.y + mobile1!.height - 1);

  // Desktop width → multi-column: card 2 to the right of card 1, same row.
  await page.setViewportSize({ width: 1280, height: 800 });
  const desktop1 = await card1.boundingBox();
  const desktop2 = await card2.boundingBox();
  expect(desktop2!.x).toBeGreaterThan(desktop1!.x + 10);
  expect(Math.abs(desktop1!.y - desktop2!.y)).toBeLessThan(2);
});

test('no horizontal overflow at a narrow mobile width', async ({ page }) => {
  await startGame(page);
  await page.setViewportSize({ width: 320, height: 720 });

  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
});

test('the chat + presence panel reflows to 320px without overflow', async ({ page }) => {
  await startGame(page);
  await page.setViewportSize({ width: 320, height: 720 });

  const panel = page.getByTestId('chat-panel');
  await expect(panel).toBeVisible();
  // Presence roster, the message list, the input and the send button all render and fit the viewport.
  await expect(page.getByTestId('presence-viewer').first()).toBeVisible();
  await expect(page.getByTestId('chat-input')).toBeVisible();
  await expect(page.getByTestId('chat-send')).toBeVisible();

  const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
  const box = await panel.boundingBox();
  expect(box).not.toBeNull();
  // The panel stays within the viewport — its right edge never spills past the client width.
  expect(box!.x + box!.width).toBeLessThanOrEqual(clientWidth + 1);

  // Sending still works at this width, and the message shows in the log.
  await page.getByTestId('chat-input').fill('mobile hello');
  await page.getByTestId('chat-send').click();
  await expect(page.getByTestId('chat-messages')).toContainText('mobile hello');
});
