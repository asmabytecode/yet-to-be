import { expect, test } from '@playwright/test';
import { buildUser } from './support';

// Стек має працювати з OAUTH_MOCK=true (docker-compose.e2e.yml): справжній Google не викликається.
test('6. вхід через Google (mock) → профіль показує прив’язаний Google', async ({ page }) => {
  const { email } = buildUser();
  const name = email.split('@')[0] ?? '';

  await page.goto('/login');
  await page.getByRole('link', { name: 'Увійти через Google' }).click();

  await expect(page.getByRole('heading', { name: 'Mock Google sign-in' })).toBeVisible();
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page).toHaveURL('/');
  await expect(page.getByRole('banner').getByText(name, { exact: true })).toBeVisible();

  await page.goto('/profile');
  await expect(page.getByText('Google прив’язано')).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();
});
