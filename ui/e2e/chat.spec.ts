import { expect, test } from '@playwright/test';

/**
 * In-game chat + presence across two browser contexts (two devices):
 * - both contexts see each other in the presence roster,
 * - a chat message sent by one appears live for the other (over the push-only WS, sent via REST),
 * - presence drops when a context closes.
 *
 * Two hotseat clients (host starts a game; guest joins by code) is the simplest shared room; each is one
 * connected viewer, so the roster has two entries.
 */
test('two clients see each other’s presence and chat, and presence drops on close', async ({ browser }) => {
  const hostCtx = await browser.newContext();
  const guestCtx = await browser.newContext();
  const host = await hostCtx.newPage();
  const guest = await guestCtx.newPage();

  // Host starts a game and reads its shareable code.
  await host.goto('/');
  await host.getByTestId('pick-game-container').click();
  await host.getByTestId('start-game').click();
  await expect(host.getByTestId('board')).toBeVisible();
  await expect(host.getByTestId('chat-panel')).toBeVisible();
  const code = await host.getByTestId('game-code').getAttribute('data-game-id');
  expect(code).toBeTruthy();

  // Guest joins the same game by code.
  await guest.goto('/');
  await guest.getByTestId('join-code').fill(code!);
  await guest.getByTestId('join-game').click();
  await expect(guest.getByTestId('board')).toBeVisible();

  // Both now see two viewers in the presence roster (each other + themselves).
  await expect(host.getByTestId('presence-viewer')).toHaveCount(2);
  await expect(guest.getByTestId('presence-viewer')).toHaveCount(2);

  // Host sends a message; it appears for the guest (and for the host) live.
  await host.getByTestId('chat-input').fill('hello from the host');
  await host.getByTestId('chat-send').click();
  await expect(guest.getByTestId('chat-messages')).toContainText('hello from the host');
  await expect(host.getByTestId('chat-messages')).toContainText('hello from the host');

  // And the other way round.
  await guest.getByTestId('chat-input').fill('hi from the guest');
  await guest.getByTestId('chat-send').click();
  await expect(host.getByTestId('chat-messages')).toContainText('hi from the guest');

  // The guest leaves; the host's roster drops back to a single viewer.
  await guestCtx.close();
  await expect(host.getByTestId('presence-viewer')).toHaveCount(1);

  await hostCtx.close();
});
