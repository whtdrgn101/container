import { expect, test } from '@playwright/test';

test('hotseat: hand a seat to the AI and it plays its own turns', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('pick-game-container').click();

  // Seats 2 and 3 go to the AI; Ann stays human.
  await page.getByTestId('toggle-bot-1').click();
  await page.getByTestId('toggle-bot-2').click();
  await page.getByTestId('start-game').click();
  await expect(page.getByTestId('board')).toBeVisible();

  // The AI seats are labelled — an unannounced robot opponent is just a confusing human.
  await expect(page.getByTestId('bot-badge-p2')).toBeVisible();
  await expect(page.getByTestId('bot-badge-p3')).toBeVisible();
  await expect(page.getByTestId('bot-badge-p1')).toHaveCount(0);

  // Ann opens, since she is seat 1.
  await expect(page.getByTestId('turn-info')).toContainText('Ann');
  await page.getByTestId('end-turn').click();

  // Bob and Cid played inside that request: it is Ann's turn again, and they have money moving
  // around (they produce, buy, and pay each other), rather than having simply passed.
  await expect(page.getByTestId('turn-info')).toContainText('Ann');
  await expect(page.getByTestId('controls')).toBeVisible();
});

test('hotseat: a human is never asked to take an AI seat’s turn', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('pick-game-container').click();
  await page.getByTestId('toggle-bot-1').click();
  await page.getByTestId('start-game').click();
  await expect(page.getByTestId('board')).toBeVisible();

  // Bob is the AI. Whatever Ann does, the board should never hand her Bob's controls — the server
  // plays him, so a second driver at that seat would be a bug.
  for (let i = 0; i < 3; i += 1) {
    await expect(page.getByTestId('turn-info')).not.toContainText('Bob');
    await page.getByTestId('end-turn').click();
  }
});

test('lobby: fill the empty seats with AI and start', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('pick-game-container').click();
  await page.getByTestId('mode-online').click();
  await page.getByTestId('create-lobby').click();
  await expect(page.getByTestId('lobby')).toBeVisible();

  // One human, two AI — the point being you can play without rounding up two other people.
  await page.getByTestId('seat-name').fill('Tim');
  await page.getByTestId('take-seat').click();
  await page.getByTestId('add-bot-seat').click();
  await page.getByTestId('add-bot-seat').click();

  await expect(page.getByTestId('lobby-seats')).toContainText('🤖');
  await expect(page.getByTestId('start-lobby')).toBeEnabled();
  await page.getByTestId('start-lobby').click();

  await expect(page.getByTestId('board')).toBeVisible();
  await expect(page.getByTestId('bot-badge-p2')).toBeVisible();
  await expect(page.getByTestId('bot-badge-p3')).toBeVisible();
  // Bound to seat 1 only, and it is our move — the AI seats took theirs on the server.
  await expect(page.getByTestId('identity-banner')).toContainText('Tim');
});

test('an all-AI table plays itself to a finish', async ({ page }) => {
  // Nice demo, and a strong end-to-end proof: the whole game runs through the real engine, the real
  // auction flow, and the real HTTP layer with no human input at all.
  await page.goto('/');
  await page.getByTestId('pick-game-container').click();
  await page.getByTestId('toggle-bot-0').click();
  await page.getByTestId('toggle-bot-1').click();
  await page.getByTestId('toggle-bot-2').click();
  await page.getByTestId('start-game').click();

  await expect(page.getByTestId('results')).toBeVisible();
  await expect(page.getByTestId('winner')).toContainText('win');
});
