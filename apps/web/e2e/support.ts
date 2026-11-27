import { randomUUID } from 'node:crypto';
import { expect, type APIRequestContext, type Page } from '@playwright/test';

export const API = '/api/v1';

export interface TestUser {
  displayName: string;
  email: string;
  password: string;
}

/** Фабрика тестового користувача: унікальні дані на кожен тест, нічого реального. */
export function buildUser(overrides: Partial<TestUser> = {}): TestUser {
  const id = randomUUID().slice(0, 8);
  return {
    displayName: `E2E ${id}`,
    email: `e2e-${id}-${Date.now().toString(36)}@example.com`,
    password: `e2e pass ${randomUUID()}`,
    ...overrides,
  };
}

/** Імена cookies залежать від протоколу: через https — з префіксами __Host-/__Secure-. */
export function cookieNames(baseURL: string | undefined) {
  const secure = (baseURL ?? '').startsWith('https://');
  return secure
    ? { access: '__Host-ytb_at', refresh: '__Secure-ytb_rt', csrf: '__Host-ytb_csrf', secure }
    : { access: 'ytb_at', refresh: 'ytb_rt', csrf: 'ytb_csrf', secure };
}

async function csrfToken(request: APIRequestContext): Promise<string> {
  const res = await request.get(`${API}/auth/csrf`);
  expect(res.ok()).toBe(true);
  return ((await res.json()) as { csrfToken: string }).csrfToken;
}

/**
 * createLoggedInAgent: реєструє користувача через API. `page.request` ділить cookies
 * з браузерним контекстом, тож після виклику сторінка вже авторизована.
 */
export async function registerViaApi(page: Page, user: TestUser = buildUser()): Promise<TestUser> {
  const token = await csrfToken(page.request);
  const res = await page.request.post(`${API}/auth/register`, {
    data: user,
    headers: { 'X-CSRF-Token': token },
  });
  expect(res.status(), await res.text()).toBe(201);
  return user;
}

/** Вхід через API в іншому контексті (другий «браузер» того самого користувача). */
export async function loginViaApi(page: Page, user: TestUser): Promise<void> {
  const token = await csrfToken(page.request);
  const res = await page.request.post(`${API}/auth/login`, {
    data: { email: user.email, password: user.password },
    headers: { 'X-CSRF-Token': token },
  });
  expect(res.status(), await res.text()).toBe(200);
}

/** Заповнює й надсилає форму входу, чекаючи на відповідь API. */
export async function submitLogin(page: Page, email: string, password: string): Promise<number> {
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().endsWith(`${API}/auth/login`) && r.request().method() === 'POST',
    ),
    page.getByRole('button', { name: 'Увійти', exact: true }).click(),
  ]);
  return response.status();
}
