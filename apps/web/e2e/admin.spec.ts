import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { adminAccount, adminAccounts, publishEvent } from './admin-support';
import { buildUser, loginViaApi, registerViaApi, submitLogin } from './support';

const uniqueTitle = (prefix: string): string => `${prefix} ${randomUUID().slice(0, 8)}`;

test.describe('адмінка й публічні події', () => {
  test.skip(
    adminAccounts().length === 0,
    'адмін-акаунти створює global-setup лише для локального стеку',
  );

  test('A1. користувач без ролей бачить 403, гість — пропозицію увійти', async ({
    page,
    browser,
  }) => {
    const guest = await browser.newPage();
    await guest.goto('/admin/');
    await expect(guest.getByRole('heading', { name: 'Потрібно увійти' })).toBeVisible();
    await guest.close();

    await registerViaApi(page);
    await page.goto('/admin/');
    await expect(page.getByRole('heading', { name: 'Немає доступу' })).toBeVisible();
  });

  test('A2. адміністратор створює й публікує подію, вона з’являється на сайті', async ({
    page,
  }) => {
    await loginViaApi(page, adminAccount(0));
    const title = uniqueTitle('E2E створення');

    await page.goto('/admin/');
    await page.getByRole('navigation').getByRole('link', { name: 'Події' }).click();
    await page.getByRole('link', { name: 'Нова подія' }).click();
    await page.getByLabel('Назва', { exact: true }).fill(title);
    await page.getByLabel('Короткий опис', { exact: true }).fill('Подія, створена в E2E');
    await page.getByLabel('Початок', { exact: true }).fill('2031-06-01T18:00');
    await page.getByLabel('Завершення', { exact: true }).fill('2031-06-01T21:00');
    await page.getByLabel('Місце', { exact: true }).fill('Kyiv Hub');
    await page.getByLabel('Кількість місць', { exact: true }).fill('5');
    await page.getByRole('button', { name: 'Створити' }).click();

    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await page.getByRole('button', { name: 'Опублікувати' }).click();
    await expect(page.getByText('Опубліковано', { exact: true })).toBeVisible();

    await page.goto('/events');
    await page.getByRole('link', { name: title }).click();
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await expect(page.getByText('Вільних місць: 5')).toBeVisible();
  });

  test('A3. гість входить зі сторінки події, записується; адмін бачить учасника', async ({
    page,
    browser,
  }) => {
    await loginViaApi(page, adminAccount(1));
    const event = await publishEvent(page, uniqueTitle('E2E запис'), 3);

    // Учасник: обліковий запис створюємо окремо, а входить він уже через форму.
    const participant = buildUser();
    const signup = await browser.newContext();
    await registerViaApi(await signup.newPage(), participant);
    await signup.close();

    const visitor = await browser.newContext();
    const tab = await visitor.newPage();
    await tab.goto(`/events/${event.slug}`);
    await tab.getByRole('link', { name: 'Увійдіть, щоб записатися' }).click();
    await expect(tab).toHaveURL(/\/login$/);
    expect(await submitLogin(tab, participant.email, participant.password)).toBe(200);
    await expect(tab).toHaveURL(new RegExp(`/events/${event.slug}$`));

    await tab.getByRole('button', { name: 'Записатися' }).click();
    await expect(tab.getByText('Ви записані')).toBeVisible();
    await expect(tab.getByText('Вільних місць: 2')).toBeVisible();

    await tab.goto('/profile');
    await expect(tab.getByRole('link', { name: event.title })).toBeVisible();
    await visitor.close();

    await page.goto(`/admin/events/${event.id}/registrations`);
    await expect(page.getByRole('cell', { name: participant.displayName })).toBeVisible();
    await expect(page.getByText('Записано: 1')).toBeVisible();
  });
});
