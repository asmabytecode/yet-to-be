import { createHmac } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { API, type TestUser } from './support';

const HERE = dirname(fileURLToPath(import.meta.url));
/** Стан між запусками (gitignored): облікові дані власника й створених адміністраторів. */
export const STATE_DIR = resolve(HERE, '../.e2e-state');
export const OWNER_FILE = resolve(STATE_DIR, 'owner.json');
export const ADMINS_FILE = resolve(STATE_DIR, 'admins.json');
export const REPO_ROOT = resolve(HERE, '../../..');

export interface OwnerState extends TestUser {
  /** TOTP-секрет власника (роль owner вимагає MFA). */
  secret: string | null;
}

/** Адміністратори (системна роль admin, без обов'язкової MFA), створені в global-setup. */
export function adminAccounts(): TestUser[] {
  if (!existsSync(ADMINS_FILE)) return [];
  return (JSON.parse(readFileSync(ADMINS_FILE, 'utf8')) as { admins: TestUser[] }).admins;
}

export function adminAccount(index = 0): TestUser {
  const account = adminAccounts()[index];
  if (account === undefined) throw new Error('Admin accounts are missing: run the local E2E stack');
  return account;
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(input: string): Buffer {
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of input.replace(/=+$/, '').toUpperCase()) {
    value = (value << 5) | ALPHABET.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** TOTP (RFC 6238, SHA-1, 30 с, 6 цифр) — як у застосунку-автентифікаторі. */
export function totp(secret: string, nowMs = Date.now()): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(Math.floor(nowMs / 30_000)));
  const digest = createHmac('sha1', base32Decode(secret)).update(message).digest();
  const offset = (digest.at(-1) ?? 0) & 0x0f;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

async function csrf(request: APIRequestContext): Promise<string> {
  const res = await request.get(`${API}/auth/csrf`);
  expect(res.ok()).toBe(true);
  return ((await res.json()) as { csrfToken: string }).csrfToken;
}

/** Запит до API зі свіжим CSRF-токеном (cookies — спільні з браузерним контекстом). */
export async function api(
  request: APIRequestContext,
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  data?: unknown,
) {
  return request.fetch(`${API}${path}`, {
    method,
    headers: { 'X-CSRF-Token': await csrf(request) },
    ...(data === undefined ? {} : { data }),
  });
}

export interface CreatedEvent {
  id: string;
  slug: string;
  title: string;
}

/** Створює й публікує повну подію від імені користувача, що увійшов у `page`. */
export async function publishEvent(
  page: Page,
  title: string,
  capacity = 10,
): Promise<CreatedEvent> {
  const created = await api(page.request, 'POST', '/admin/events', {
    title,
    summary: 'Подія з E2E',
    venueName: 'Kyiv Hub',
    startsAt: '2031-06-01T15:00:00.000Z',
    endsAt: '2031-06-01T18:00:00.000Z',
    timezone: 'Europe/Kyiv',
    capacity,
  });
  expect(created.status(), await created.text()).toBe(201);
  const event = (await created.json()) as CreatedEvent & { version: number };
  const published = await api(page.request, 'POST', `/admin/events/${event.id}/transition`, {
    action: 'publish',
    version: event.version,
  });
  expect(published.status(), await published.text()).toBe(200);
  return { id: event.id, slug: event.slug, title: event.title };
}
