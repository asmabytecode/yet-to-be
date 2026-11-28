import { expect, test } from '@playwright/test';

test.describe('публічні події (гість)', () => {
  test('E1. список подій відкритий без входу, у меню — «Увійти»', async ({ page }) => {
    await page.goto('/events');
    await expect(page.getByRole('heading', { level: 1, name: 'Події' })).toBeVisible();
    const nav = page.getByRole('navigation', { name: 'Основна навігація' });
    await expect(nav.getByRole('link', { name: 'Увійти' })).toBeVisible();
    await expect(nav.getByRole('button', { name: 'Вийти' })).toHaveCount(0);
  });

  test('E2. неіснуюча подія показує «Не знайдено» і посилання назад', async ({ page }) => {
    await page.goto('/events/ne-isnuie-takoi-podii');
    await expect(page.getByText('Не знайдено.')).toBeVisible();
    await page.getByRole('link', { name: 'До всіх подій' }).click();
    await expect(page).toHaveURL(/\/events$/);
  });
});
