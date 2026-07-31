import { expect, test } from '@playwright/test';

test("shows the active player's secret scoring card and hides opponents'", async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('pick-game-container').click();
  await page.getByTestId('start-game').click();
  await expect(page.getByTestId('board')).toBeVisible();

  // Ann is active → her card is revealed (values + the two-value ★); Bob's is hidden.
  await expect(page.getByTestId('scoring-card-p1')).toContainText('Your card');
  await expect(page.getByTestId('scoring-card-p1')).toContainText('$10');
  await expect(page.getByTestId('scoring-card-p1')).toContainText('★');
  await expect(page.getByTestId('scoring-card-p2')).toContainText('Secret');

  // Passing the turn reveals Bob's card and hides Ann's (pass-and-play secrecy).
  await page.getByTestId('end-turn').click();
  await expect(page.getByTestId('scoring-card-p2')).toContainText('Your card');
  await expect(page.getByTestId('scoring-card-p1')).toContainText('Secret');
});
