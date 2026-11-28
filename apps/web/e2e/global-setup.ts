import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { type APIRequestContext, type FullConfig, request } from '@playwright/test';
import {
  ADMINS_FILE,
  api,
  OWNER_FILE,
  type OwnerState,
  REPO_ROOT,
  STATE_DIR,
  totp,
} from './admin-support';
import { API, buildUser, type TestUser } from './support';

// Як і playwright.config.ts, global-setup — частина конфігурації E2E, тож читає оточення напряму.
// eslint-disable-next-line n/no-process-env
const OWNER_GRANT_CMD = process.env['E2E_OWNER_GRANT_CMD'];
const ADMIN_ROLE_ID = '00000000-0000-4000-8000-000000000002';
const ADMIN_COUNT = 2;

const isLocal = (url: string): boolean => /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(url);

function loadOwner(): OwnerState | null {
  return existsSync(OWNER_FILE)
    ? (JSON.parse(readFileSync(OWNER_FILE, 'utf8')) as OwnerState)
    : null;
}

function saveOwner(owner: OwnerState): void {
  writeFileSync(OWNER_FILE, JSON.stringify(owner, null, 2), { mode: 0o600 });
}

async function signUpOrIn(ctx: APIRequestContext, user: TestUser): Promise<number> {
  // Схема реєстрації строга: лише ці три поля (секрет TOTP із OwnerState сюди не потрапляє).
  const registered = await api(ctx, 'POST', '/auth/register', {
    email: user.email,
    password: user.password,
    displayName: user.displayName,
  });
  if (registered.status() !== 409) return registered.status();
  const login = await api(ctx, 'POST', '/auth/login', {
    email: user.email,
    password: user.password,
  });
  return login.status();
}

/** Власника призначає лише серверна команда (не HTTP) — як у production. */
function grantOwner(email: string): void {
  const command = OWNER_GRANT_CMD;
  try {
    if (command !== undefined) {
      execFileSync(command, [email], { cwd: REPO_ROOT, stdio: 'pipe' });
      return;
    }
    execFileSync(
      'docker',
      [
        'compose',
        '-f',
        'docker-compose.yml',
        '-f',
        'docker-compose.e2e.yml',
        'exec',
        '-T',
        'api',
        'node',
        'dist/cli/owner-grant.js',
        email,
      ],
      { cwd: REPO_ROOT, stdio: 'pipe' },
    );
  } catch (error) {
    const stderr = (error as { stderr?: Buffer }).stderr?.toString() ?? '';
    throw new Error(
      `owner:grant failed: ${stderr.trim()}\n` +
        'Якщо власник уже інший — скиньте стек: docker compose -f docker-compose.yml -f docker-compose.e2e.yml down -v',
    );
  }
}

async function verifyMfa(ctx: APIRequestContext, owner: OwnerState): Promise<void> {
  const status = (await (await ctx.get(`${API}/auth/mfa`)).json()) as { enabled: boolean };
  if (!status.enabled) {
    const setup = await api(ctx, 'POST', '/auth/mfa/setup');
    owner.secret = ((await setup.json()) as { secret: string }).secret;
    saveOwner(owner);
    const enabled = await api(ctx, 'POST', '/auth/mfa/enable', { code: totp(owner.secret) });
    if (!enabled.ok()) throw new Error(`MFA enable failed: ${await enabled.text()}`);
    return;
  }
  if (owner.secret === null)
    throw new Error('Owner MFA secret is unknown: reset the E2E stack (down -v)');
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const verified = await api(ctx, 'POST', '/auth/mfa/verify', { code: totp(owner.secret) });
    if (verified.ok()) return;
    // Код цього 30-секундного кроку вже використано (захист від повтору) — чекаємо наступний.
    await new Promise((done) => setTimeout(done, 31_000));
  }
  throw new Error('Owner MFA verification failed');
}

/**
 * Готує адмін-акаунти для E2E адмінки: власник (owner:grant через docker compose exec + TOTP)
 * видає системну роль admin кільком новим користувачам. Лише для локального стеку: для
 * віддаленого стенда адмін-сценарії пропускаються (там немає доступу до серверної команди).
 */
export default async function globalSetup(config: FullConfig): Promise<void> {
  rmSync(ADMINS_FILE, { force: true });
  const baseURL = config.projects[0]?.use.baseURL ?? 'http://localhost:8080';
  if (!isLocal(baseURL) && OWNER_GRANT_CMD === undefined) return;
  mkdirSync(STATE_DIR, { recursive: true });

  const owner: OwnerState = loadOwner() ?? {
    ...buildUser({ displayName: 'E2E Owner', email: 'e2e-owner@example.com' }),
    password: `owner ${randomUUID()}`,
    secret: null,
  };
  saveOwner(owner);

  const ownerCtx = await request.newContext({ baseURL });
  try {
    const status = await signUpOrIn(ownerCtx, owner);
    if (status !== 200 && status !== 201) {
      throw new Error(`Owner sign-in failed (${String(status)}): reset the E2E stack (down -v)`);
    }
    grantOwner(owner.email);
    await verifyMfa(ownerCtx, owner);
    const stepUp = await api(ownerCtx, 'POST', '/auth/step-up', { password: owner.password });
    if (!stepUp.ok()) throw new Error(`Owner step-up failed: ${await stepUp.text()}`);

    const admins: TestUser[] = [];
    for (let index = 0; index < ADMIN_COUNT; index += 1) {
      const admin = buildUser({ displayName: `E2E Admin ${String(index + 1)}` });
      const ctx = await request.newContext({ baseURL });
      const created = await api(ctx, 'POST', '/auth/register', admin);
      await ctx.dispose();
      if (created.status() !== 201)
        throw new Error(`Admin sign-up failed: ${await created.text()}`);
      const granted = await api(ownerCtx, 'POST', '/admin/members', {
        email: admin.email,
        roleId: ADMIN_ROLE_ID,
      });
      if (granted.status() !== 204) throw new Error(`Grant failed: ${await granted.text()}`);
      admins.push(admin);
    }
    writeFileSync(ADMINS_FILE, JSON.stringify({ admins }, null, 2), { mode: 0o600 });
  } finally {
    await ownerCtx.dispose();
  }
}
