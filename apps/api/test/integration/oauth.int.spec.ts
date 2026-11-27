import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { FakeOAuthProvider } from '../fake-oauth-provider';
import { API, cookieValue, createTestApp, signUp, type TestApp } from '../test-app';

const APP = 'http://localhost:5173';
const FAILURE = `${APP}/login?error=oauth_failed`;

describe('Google sign-in (e2e, mock provider)', () => {
  let ctx: TestApp;
  const provider = new FakeOAuthProvider();

  beforeAll(async () => {
    ctx = await createTestApp([], provider);
  });
  afterAll(async () => {
    await ctx.close();
  });
  beforeEach(() => {
    provider.profile = {
      provider: 'google',
      subject: `sub-${Math.random().toString(36).slice(2)}`,
      email: `g${Math.random().toString(36).slice(2)}@example.com`,
      emailVerified: true,
      name: 'Grace Hopper',
    };
  });

  async function startFlow(agent = ctx.agent(), returnTo?: string) {
    const query = returnTo === undefined ? '' : `?returnTo=${encodeURIComponent(returnTo)}`;
    const res = await agent.get(`${API}/auth/google${query}`);
    return { agent, res };
  }

  const callback = (agent: ReturnType<TestApp['agent']>, query = 'code=ok&state=state-123') =>
    agent.get(`${API}/auth/google/callback?${query}`);

  describe('start', () => {
    it('redirects to the provider and sets a signed httpOnly transaction cookie', async () => {
      const { res } = await startFlow();
      expect(res.status).toBe(302);
      expect(res.headers['location']).toContain('https://accounts.example.test/authorize');

      const line = (res.headers['set-cookie'] as unknown as string[]).find((c) =>
        c.startsWith('yt_oauth='),
      );
      expect(line).toBeDefined();
      expect(line).toContain('HttpOnly');
      expect(line).toContain('SameSite=Lax');
      expect(decodeURIComponent(line ?? '')).toContain('yt_oauth=s:');
    });
  });

  it('hides the E2E mock consent page when OAUTH_MOCK is off', async () => {
    await ctx
      .agent()
      .get(`${API}/auth/google/mock-consent?state=${'a'.repeat(32)}`)
      .expect(404);
  });

  describe('callback: the four linking branches', () => {
    it('creates a new passwordless user and signs them in', async () => {
      const { agent } = await startFlow();
      const res = await callback(agent);
      expect(res.status).toBe(302);
      expect(res.headers['location']).toBe(`${APP}/`);

      const session = await agent.get(`${API}/auth/session`).expect(200);
      const user = (
        session.body as { user: { email: string; providers: string[]; displayName: string } }
      ).user;
      expect(user.email).toBe(provider.profile.email);
      expect(user.providers).toEqual(['google']);
      expect(user.displayName).toBe('Grace Hopper');

      const row = await ctx.db.prisma.user.findFirstOrThrow({ orderBy: { createdAt: 'desc' } });
      expect(row.passwordHash).toBeNull();
      expect(row.emailVerifiedAt).not.toBeNull();
      expect(row.emailEncrypted).not.toContain('@');
    });

    it('signs an already linked account in again (same user)', async () => {
      await callback((await startFlow()).agent);
      const before = await ctx.db.prisma.user.count();
      const second = await startFlow();
      await callback(second.agent);
      await second.agent.get(`${API}/auth/session`).expect(200);
      expect(await ctx.db.prisma.user.count()).toBe(before);
    });

    it('links Google to an existing user with the same verified email', async () => {
      const email = `existing${Math.random().toString(36).slice(2)}@example.com`;
      await signUp(ctx, email);
      provider.profile = { ...provider.profile, email: email.toUpperCase() };

      const { agent } = await startFlow();
      expect((await callback(agent)).headers['location']).toBe(`${APP}/`);

      const session = await agent.get(`${API}/auth/session`).expect(200);
      expect((session.body as { user: { providers: string[] } }).user.providers).toEqual([
        'password',
        'google',
      ]);
      const actions = (await ctx.db.prisma.auditLog.findMany()).map((a) => a.action);
      expect(actions).toContain('auth.oauth_linked');
    });

    it('refuses an unverified provider email and creates nothing', async () => {
      const before = await ctx.db.prisma.user.count();
      provider.profile = { ...provider.profile, emailVerified: false };
      const { agent } = await startFlow();
      const res = await callback(agent);
      expect(res.headers['location']).toBe(FAILURE);
      expect(cookieValue(res.headers['set-cookie'], 'ytb_at')).toBeUndefined();
      expect(await ctx.db.prisma.user.count()).toBe(before);
    });

    it('does not link an unverified email to an existing account', async () => {
      const email = `victim${Math.random().toString(36).slice(2)}@example.com`;
      await signUp(ctx, email);
      provider.profile = { ...provider.profile, email, emailVerified: false };
      const res = await callback((await startFlow()).agent);
      expect(res.headers['location']).toBe(FAILURE);
      expect(
        await ctx.db.prisma.oAuthAccount.count({
          where: { providerAccountId: provider.profile.subject },
        }),
      ).toBe(0);
    });
  });

  describe('callback: failures', () => {
    it('rejects a wrong state', async () => {
      const { agent } = await startFlow();
      const res = await callback(agent, 'code=ok&state=forged');
      expect(res.headers['location']).toBe(FAILURE);
      expect(cookieValue(res.headers['set-cookie'], 'ytb_at')).toBeUndefined();
    });

    it('rejects a missing transaction cookie and missing parameters', async () => {
      expect((await callback(ctx.agent())).headers['location']).toBe(FAILURE);
      const { agent } = await startFlow();
      expect((await callback(agent, 'state=state-123')).headers['location']).toBe(FAILURE);
    });

    it('rejects a tampered or unsigned transaction cookie', async () => {
      const forged = encodeURIComponent(
        `s:${JSON.stringify({ state: 'state-123', nonce: 'n', codeVerifier: 'v', returnTo: '/' })}.badsignature`,
      );
      const res = await ctx
        .agent()
        .get(`${API}/auth/google/callback?code=ok&state=state-123`)
        .set('Cookie', `yt_oauth=${forged}`);
      expect(res.headers['location']).toBe(FAILURE);

      const unsigned = await ctx
        .agent()
        .get(`${API}/auth/google/callback?code=ok&state=state-123`)
        .set('Cookie', `yt_oauth=${encodeURIComponent('{"state":"state-123"}')}`);
      expect(unsigned.headers['location']).toBe(FAILURE);
    });

    it('treats a provider error or a rejected code as a generic failure without details in the URL', async () => {
      const { agent } = await startFlow();
      const denied = await callback(agent, 'error=access_denied&state=state-123');
      expect(denied.headers['location']).toBe(FAILURE);

      const second = await startFlow();
      const rejected = await callback(second.agent, 'code=bad&state=state-123');
      expect(rejected.headers['location']).toBe(FAILURE);
      expect(String(rejected.headers['location'])).not.toContain('Provider');
    });

    it('does not allow replaying the callback: the transaction cookie is single-use', async () => {
      const { agent } = await startFlow();
      expect((await callback(agent)).headers['location']).toBe(`${APP}/`);
      expect((await callback(agent)).headers['location']).toBe(FAILURE);
    });
  });

  describe('returnTo', () => {
    it('returns to an allowlisted relative path', async () => {
      const { agent } = await startFlow(ctx.agent(), '/profile');
      expect((await callback(agent)).headers['location']).toBe(`${APP}/profile`);
    });

    it.each(['https://evil.example/', '//evil.example', '/not-allowed', '/\\evil.example'])(
      'ignores the unsafe returnTo %s',
      async (returnTo) => {
        const { agent } = await startFlow(ctx.agent(), returnTo);
        expect((await callback(agent)).headers['location']).toBe(`${APP}/`);
      },
    );
  });
});
