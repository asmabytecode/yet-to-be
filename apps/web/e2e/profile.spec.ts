import { expect, test } from '@playwright/test';
import { loginViaApi, registerViaApi, submitLogin } from './support';

test.describe('профіль', () => {
  test('4. редагування профілю зберігається після перезавантаження', async ({ page }) => {
    await registerViaApi(page);
    await page.goto('/profile');

    await page.getByLabel('Прізвище').fill('Lovelace');
    await page.getByLabel('Про себе').fill('Перша програмістка');
    await page.getByRole('button', { name: 'Зберегти' }).click();
    await expect(page.getByText('Профіль оновлено')).toBeVisible();

    await page.reload();
    await expect(page.getByLabel('Прізвище')).toHaveValue('Lovelace');
    await expect(page.getByLabel('Про себе')).toHaveValue('Перша програмістка');
  });

  test('5. зміна пароля: старий не працює, новий працює, інший браузер розлогінено', async ({
    page,
    browser,
  }) => {
    const user = await registerViaApi(page);

    // Другий «браузер» того самого користувача.
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await loginViaApi(otherPage, user);
    await otherPage.goto('/profile');
    await expect(otherPage.getByRole('heading', { name: 'Профіль' })).toBeVisible();

    const newPassword = `${user.password} v2`;
    await page.goto('/profile');
    await page.getByLabel('Поточний пароль').fill(user.password);
    await page.getByLabel('Новий пароль').fill(newPassword);
    await page.getByRole('button', { name: 'Змінити пароль' }).click();
    await expect(page.getByText('Пароль змінено. Інші сесії завершено.')).toBeVisible();

    await otherPage.reload();
    await expect(otherPage).toHaveURL(/\/login/);
    await other.close();

    const fresh = await browser.newContext();
    const freshPage = await fresh.newPage();
    await freshPage.goto('/login');
    expect(await submitLogin(freshPage, user.email, user.password)).toBe(401);
    expect(await submitLogin(freshPage, user.email, newPassword)).toBe(200);
    await expect(freshPage).toHaveURL('/');
    await fresh.close();
  });
});
