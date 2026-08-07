import { expect, test } from '@playwright/test';

/**
 * The footer and its About screen — shell chrome, so this spec names no game.
 *
 * What matters here is that About is an *overlay*, not a place: it opens from wherever you are and
 * closing it puts you back, which is the one thing easy to break by folding it into the screen cascade
 * in `App.tsx`.
 */
test('the footer opens the About screen and closes back to the shelf', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('game-shelf')).toBeVisible();

  await page.getByTestId('site-footer').getByTestId('about-link').click();
  const about = page.getByTestId('about-screen');
  await expect(about).toBeVisible();
  await expect(about).toContainText('No accounts');
  await expect(page.getByTestId('game-shelf')).toBeHidden();

  await page.getByTestId('about-back').click();
  await expect(page.getByTestId('game-shelf')).toBeVisible();
});

test('About opens over a game detail screen and returns to it', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('game-shelf').getByRole('button').first().click();
  await expect(page.getByTestId('game-detail')).toBeVisible();

  await page.getByTestId('about-link').click();
  await expect(page.getByTestId('about-screen')).toBeVisible();

  await page.getByTestId('about-back').click();
  await expect(page.getByTestId('game-detail')).toBeVisible();
});

test('the footer and About screen reflow to 320px without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/');

  const noOverflow = async () => {
    const [scrollWidth, clientWidth] = await page.evaluate(() => [
      document.documentElement.scrollWidth,
      document.documentElement.clientWidth,
    ]);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  };

  await expect(page.getByTestId('site-footer')).toBeVisible();
  await noOverflow();

  await page.getByTestId('about-link').click();
  await expect(page.getByTestId('about-screen')).toBeVisible();
  await noOverflow();
});
