import { expect, test } from '@playwright/test';
import { buildUser, registerViaApi, submitLogin } from './support';

test.describe('автентифікація', () => {
  test('1. реєстрація → головна, у header показано ім’я', async ({ page }) => {
    const user = buildUser();
    await page.goto('/register');

    await page.getByLabel("Ім'я", { exact: true }).fill(user.displayName);
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Пароль', { exact: true }).fill(user.password);
    await page.getByRole('button', { name: 'Зареєструватися' }).click();

    await expect(page).toHaveURL('/');
    await expect(
      page.getByRole('banner').getByText(user.displayName, { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: `Вітаємо, ${user.displayName}!` }),
    ).toBeVisible();
  });

  test('2. вихід → /login; /profile знову веде на /login', async ({ page }) => {
    await registerViaApi(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Вітаємо/ })).toBeVisible();

    await page.getByRole('button', { name: 'Вийти' }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.goto('/profile');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('heading', { name: 'Вхід' })).toBeVisible();
  });

  test('3. невірний пароль → загальна помилка; після 5 спроб — блокування', async ({ page }) => {
    const user = await registerViaApi(page);
    await page.context().clearCookies();
    await page.goto('/login');
    const alert = page.getByRole('alert');

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      expect(await submitLogin(page, user.email, 'definitely wrong password')).toBe(401);
      await expect(alert).toHaveText('Невірний email або пароль.');
    }

    // Акаунт заблоковано: навіть правильний пароль не пускає.
    expect(await submitLogin(page, user.email, user.password)).toBe(423);
    await expect(alert).toHaveText('Забагато невдалих спроб. Акаунт тимчасово заблоковано.');
    await expect(page).toHaveURL(/\/login$/);
  });
});
