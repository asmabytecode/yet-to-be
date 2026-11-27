import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '@yet-to-be/shared';
import { API, cookieValue, createTestApp, csrfToken, type TestApp } from './test-app';

const PASSWORD = 'correct horse battery staple';

describe('auth (e2e)', () => {
  let ctx: TestApp;
  let counter = 0;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.close();
  });

  const email = (): string => `user${String((counter += 1))}@example.com`;

  async function register(agent = ctx.agent(), address = email()) {
    const token = await csrfToken(agent);
    const res = await agent
      .post(`${API}/auth/register`)
      .set('X-CSRF-Token', token)
      .send({ email: address, password: PASSWORD, displayName: 'Ada' });
    // Після входу сервер ротує CSRF-токен: актуальне значення — у Set-Cookie.
    return { agent, token: cookieValue(res.headers['set-cookie'], 'ytb_csrf') ?? token, res, address };
  }

  async function login(address: string, password = PASSWORD, agent = ctx.agent()) {
    const token = await csrfToken(agent);
    const res = await agent
      .post(`${API}/auth/login`)
      .set('X-CSRF-Token', token)
      .send({ email: address, password });
    return { agent, token: cookieValue(res.headers['set-cookie'], 'ytb_csrf') ?? token, res };
  }

  describe('csrf', () => {
    it('issues a token and keeps it stable for the same browser', async () => {
      const agent = ctx.agent();
      const first = await agent.get(`${API}/auth/csrf`).expect(200);
      const second = await agent.get(`${API}/auth/csrf`).expect(200);
      expect((first.body as { csrfToken: string }).csrfToken).toBe(
        (second.body as { csrfToken: string }).csrfToken,
      );
      expect(cookieValue(first.headers['set-cookie'], 'ytb_csrf')).toBeDefined();
    });

    it('rejects state-changing requests without a matching token', async () => {
      const agent = ctx.agent();
      const body = { email: email(), password: PASSWORD, displayName: 'Ada' };

      const missing = await agent.post(`${API}/auth/register`).send(body).expect(403);
      expect((missing.body as { code: string }).code).toBe(ERROR_CODES.CSRF_INVALID);

      await csrfToken(agent);
      await agent.post(`${API}/auth/register`).set('X-CSRF-Token', 'wrong').send(body).expect(403);
    });

    it('rejects requests from a foreign Origin or cross-site fetch', async () => {
      const agent = ctx.agent();
      const token = await csrfToken(agent);
      const body = { email: email(), password: PASSWORD, displayName: 'Ada' };
      await agent
        .post(`${API}/auth/register`)
        .set('X-CSRF-Token', token)
        .set('Origin', 'https://evil.example')
        .send(body)
        .expect(403);
      await agent
        .post(`${API}/auth/register`)
        .set('X-CSRF-Token', token)
        .set('Sec-Fetch-Site', 'cross-site')
        .send(body)
        .expect(403);
    });
  });

  describe('register', () => {
    it('creates an account, sets hardened cookies and never returns secrets', async () => {
      const { res, address } = await register();
      expect(res.status).toBe(201);
      const user = (res.body as { user: Record<string, unknown> }).user;
      expect(user).toMatchObject({ email: address, displayName: 'Ada', providers: ['password'] });
      expect(JSON.stringify(res.body)).not.toMatch(/hash|failedLogins|lockedUntil|"password"\s*:/i);

      const cookies = (res.headers['set-cookie'] as unknown as string[]).join('\n');
      for (const name of ['ytb_at', 'ytb_rt']) {
        const line = cookies.split('\n').find((c) => c.startsWith(`${name}=`)) ?? '';
        expect(line).toContain('HttpOnly');
        expect(line).toContain('SameSite=Strict');
      }
      expect(cookies).toContain('Path=/api/v1/auth');
    });

    it('stores the email encrypted and the password hashed', async () => {
      const { address } = await register();
      const rows = await ctx.db.prisma.user.findMany();
      const row = rows.find((r) => r.emailEncrypted !== '' && !r.emailEncrypted.includes(address));
      expect(row).toBeDefined();
      for (const stored of rows) {
        expect(stored.emailEncrypted.startsWith('v1:k1:')).toBe(true);
        expect(stored.passwordHash?.startsWith('$argon2id$')).toBe(true);
        expect(stored.emailEncrypted).not.toContain('@example.com');
      }
    });

    it('rejects a duplicate email regardless of case and spaces', async () => {
      const { address } = await register();
      const agent = ctx.agent();
      const token = await csrfToken(agent);
      const res = await agent
        .post(`${API}/auth/register`)
        .set('X-CSRF-Token', token)
        .send({ email: address.toUpperCase(), password: PASSWORD, displayName: 'Eve' });
      expect(res.status).toBe(409);
      expect((res.body as { code: string }).code).toBe(ERROR_CODES.AUTH_EMAIL_TAKEN);
    });

    it('validates input without echoing values back', async () => {
      const agent = ctx.agent();
      const token = await csrfToken(agent);
      const res = await agent
        .post(`${API}/auth/register`)
        .set('X-CSRF-Token', token)
        .send({ email: 'not-an-email', password: 'short', displayName: '', extra: 'field' });
      expect(res.status).toBe(400);
      const body = res.body as { code: string; issues: { path: string }[] };
      expect(body.code).toBe(ERROR_CODES.VALIDATION_FAILED);
      expect(body.issues.map((i) => i.path)).toEqual(expect.arrayContaining(['email', 'password']));
      expect(JSON.stringify(res.body)).not.toContain('not-an-email');
      expect(JSON.stringify(res.body)).not.toContain('short');
    });

    it('rejects common passwords and passwords containing the email name', async () => {
      const agent = ctx.agent();
      const token = await csrfToken(agent);
      for (const password of ['password123', 'ada.lovelace-2024']) {
        const res = await agent
          .post(`${API}/auth/register`)
          .set('X-CSRF-Token', token)
          .send({ email: 'ada.lovelace@example.com', password, displayName: 'Ada' });
        expect(res.status).toBe(400);
        expect((res.body as { code: string }).code).toBe(ERROR_CODES.AUTH_WEAK_PASSWORD);
      }
    });
  });

  describe('login', () => {
    it('logs in with correct credentials and returns the same error for bad ones', async () => {
      const { address } = await register();
      const ok = await login(address);
      expect(ok.res.status).toBe(200);

      const wrongPassword = await login(address, 'definitely wrong password');
      const unknownEmail = await login('nobody@example.com');
      expect(wrongPassword.res.status).toBe(401);
      expect(unknownEmail.res.status).toBe(401);
      const a = wrongPassword.res.body as { code: string; message: string };
      const b = unknownEmail.res.body as { code: string; message: string };
      expect(a.code).toBe(ERROR_CODES.AUTH_INVALID_CREDENTIALS);
      expect({ code: a.code, message: a.message }).toEqual({ code: b.code, message: b.message });
    });

    it('locks the account after 5 failures and unlocks after the lock expires', async () => {
      const { address } = await register();
      for (let i = 0; i < 5; i += 1) {
        expect((await login(address, 'wrong password!!')).res.status).toBe(401);
      }
      const locked = await login(address);
      expect(locked.res.status).toBe(423);
      expect((locked.res.body as { code: string }).code).toBe(ERROR_CODES.AUTH_LOCKED);

      await ctx.db.prisma.user.updateMany({ data: { lockedUntil: new Date(Date.now() - 1000) } });
      expect((await login(address)).res.status).toBe(200);
      const user = await ctx.db.prisma.user.findFirst({ orderBy: { createdAt: 'desc' } });
      expect(user?.failedLogins).toBe(0);
    });
  });

  describe('session', () => {
    it('requires authentication and then returns the current user', async () => {
      await ctx.agent().get(`${API}/auth/session`).expect(401);
      const { agent, address } = await register();
      const res = await agent.get(`${API}/auth/session`).expect(200);
      expect((res.body as { user: { email: string } }).user.email).toBe(address);
    });

    it('rejects a forged or tampered access token', async () => {
      await ctx
        .agent()
        .get(`${API}/auth/session`)
        .set('Cookie', 'ytb_at=eyJhbGciOiJub25lIn0.e30.')
        .expect(401);
    });
  });

  describe('refresh', () => {
    it('rotates the refresh token', async () => {
      const { agent, token } = await register();
      const res = await agent.post(`${API}/auth/refresh`).set('X-CSRF-Token', token).expect(200);
      expect(cookieValue(res.headers['set-cookie'], 'ytb_rt')).toBeDefined();
      await agent.get(`${API}/auth/session`).expect(200);
    });

    it('detects reuse of an old refresh token and revokes the whole family', async () => {
      const { res: reg, token } = await register();
      const oldRefresh = cookieValue(reg.headers['set-cookie'], 'ytb_rt') ?? '';
      const csrf = cookieValue(reg.headers['set-cookie'], 'ytb_csrf') ?? token;
      const cookie = (refresh: string): string => `ytb_rt=${refresh}; ytb_csrf=${csrf}`;

      const rotated = await ctx
        .agent()
        .post(`${API}/auth/refresh`)
        .set('Cookie', cookie(oldRefresh))
        .set('X-CSRF-Token', csrf)
        .expect(200);
      const newRefresh = cookieValue(rotated.headers['set-cookie'], 'ytb_rt') ?? '';
      expect(newRefresh).not.toBe(oldRefresh);

      const replay = await ctx
        .agent()
        .post(`${API}/auth/refresh`)
        .set('Cookie', cookie(oldRefresh))
        .set('X-CSRF-Token', csrf);
      expect(replay.status).toBe(401);

      const afterReuse = await ctx
        .agent()
        .post(`${API}/auth/refresh`)
        .set('Cookie', cookie(newRefresh))
        .set('X-CSRF-Token', csrf);
      expect(afterReuse.status).toBe(401);
      const actions = (await ctx.db.prisma.auditLog.findMany()).map((a) => a.action);
      expect(actions).toContain('auth.refresh_reuse_detected');
    });

    it('fails without a refresh cookie and clears cookies', async () => {
      const agent = ctx.agent();
      const token = await csrfToken(agent);
      const res = await agent.post(`${API}/auth/refresh`).set('X-CSRF-Token', token);
      expect(res.status).toBe(401);
      expect((res.body as { code: string }).code).toBe(ERROR_CODES.AUTH_SESSION_EXPIRED);
    });

    it('rejects an expired session', async () => {
      const { agent, token } = await register();
      await ctx.db.prisma.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
      await agent.post(`${API}/auth/refresh`).set('X-CSRF-Token', token).expect(401);
    });
  });

  describe('logout', () => {
    it('revokes the session immediately, even for an access token that has not expired', async () => {
      const { agent, token, res } = await register();
      const accessCookie = `ytb_at=${cookieValue(res.headers['set-cookie'], 'ytb_at') ?? ''}`;

      await agent.post(`${API}/auth/logout`).set('X-CSRF-Token', token).expect(204);
      await agent.get(`${API}/auth/session`).expect(401);
      await ctx.agent().get(`${API}/auth/session`).set('Cookie', accessCookie).expect(401);
    });

    it('is idempotent without any cookies', async () => {
      const agent = ctx.agent();
      const token = await csrfToken(agent);
      await agent.post(`${API}/auth/logout`).set('X-CSRF-Token', token).expect(204);
    });

    it('logout-all ends every session of the user', async () => {
      const { address, agent: first, token } = await register();
      const second = await login(address);
      await second.agent.get(`${API}/auth/session`).expect(200);

      await first.post(`${API}/auth/logout-all`).set('X-CSRF-Token', token).expect(204);
      await first.get(`${API}/auth/session`).expect(401);
      await second.agent.get(`${API}/auth/session`).expect(401);
    });

    it('logout-all requires authentication', async () => {
      const agent = ctx.agent();
      const token = await csrfToken(agent);
      await agent.post(`${API}/auth/logout-all`).set('X-CSRF-Token', token).expect(401);
    });
  });
});
