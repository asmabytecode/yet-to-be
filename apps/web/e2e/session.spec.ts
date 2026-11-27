import { expect, test } from '@playwright/test';
import { API, buildUser, cookieNames, registerViaApi } from './support';

test.describe('сесія і cookies', () => {
  test('7. протухлий access token → тихий refresh, користувач нічого не помічає', async ({
    page,
    context,
    baseURL,
  }) => {
    const names = cookieNames(baseURL);
    const user = await registerViaApi(page);
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: `Вітаємо, ${user.displayName}!` }),
    ).toBeVisible();

    // Імітуємо закінчення TTL: браузер більше не має access-cookie, refresh лишається.
    await context.clearCookies({ name: names.access });

    const refreshed = page.waitForResponse(
      (r) => r.url().endsWith(`${API}/auth/refresh`) && r.status() === 200,
    );
    await page.reload();
    await refreshed;

    await expect(page).toHaveURL('/');
    await expect(
      page.getByRole('heading', { name: `Вітаємо, ${user.displayName}!` }),
    ).toBeVisible();
    const cookies = await context.cookies();
    expect(cookies.some((c) => c.name === names.access)).toBe(true);
  });

  test('8. токени недоступні JS; атрибути cookies правильні', async ({
    page,
    context,
    baseURL,
    browserName,
  }) => {
    const names = cookieNames(baseURL);

    // SameSite перевіряємо за сирими Set-Cookie: WebKit поза macOS у context.cookies()
    // завжди повертає sameSite "None", тож API браузера для цього атрибута ненадійне.
    const csrfRes = await page.request.get(`${API}/auth/csrf`);
    const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
    const user = buildUser();
    const registerRes = await page.request.post(`${API}/auth/register`, {
      data: user,
      headers: { 'X-CSRF-Token': csrfToken },
    });
    expect(registerRes.status(), await registerRes.text()).toBe(201);
    const setCookies = [...csrfRes.headersArray(), ...registerRes.headersArray()]
      .filter((h) => h.name.toLowerCase() === 'set-cookie')
      .map((h) => h.value);
    const raw = (name: string) => setCookies.find((c) => c.startsWith(`${name}=`)) ?? '';

    expect(raw(names.access)).toMatch(/;\s*HttpOnly/i);
    expect(raw(names.access)).toMatch(/;\s*SameSite=Strict/i);
    expect(raw(names.access)).toMatch(/;\s*Path=\/(;|$)/i);
    expect(raw(names.refresh)).toMatch(/;\s*HttpOnly/i);
    expect(raw(names.refresh)).toMatch(/;\s*SameSite=Strict/i);
    expect(raw(names.refresh)).toContain(`Path=${API}/auth`);
    expect(raw(names.csrf)).toMatch(/;\s*SameSite=Strict/i);
    expect(raw(names.csrf)).not.toMatch(/;\s*HttpOnly/i);
    if (names.secure) {
      for (const n of [names.access, names.refresh, names.csrf]) {
        expect(raw(n)).toMatch(/;\s*Secure/i);
      }
    }

    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Вітаємо/ })).toBeVisible();

    const visible = await page.evaluate(() => document.cookie);
    expect(visible).not.toContain(`${names.access}=`);
    expect(visible).not.toContain(`${names.refresh}=`);
    expect(visible).toContain(`${names.csrf}=`);

    const cookies = await context.cookies();
    const byName = (name: string) => cookies.find((c) => c.name === name);
    const sameSite = browserName === 'webkit' ? {} : { sameSite: 'Strict' as const };

    expect(byName(names.access)).toMatchObject({
      httpOnly: true,
      path: '/',
      secure: names.secure,
      ...sameSite,
    });
    expect(byName(names.refresh)).toMatchObject({
      httpOnly: true,
      path: `${API}/auth`,
      secure: names.secure,
      ...sameSite,
    });
    expect(byName(names.csrf)).toMatchObject({ httpOnly: false, path: '/', ...sameSite });
  });
});
