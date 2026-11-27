import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { API, createTestApp, type TestApp } from '../test-app';

// Виконується до імпортів: ConfigModule читає env під час завантаження модуля.
vi.hoisted(() => {
  process.env['OAUTH_MOCK'] = 'true';
});

const APP = 'http://localhost:5173';

describe('Google sign-in through the E2E mock provider', () => {
  let ctx: TestApp;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('runs the full redirect flow: start → consent page → callback → session', async () => {
    const agent = ctx.agent();

    const start = await agent.get(`${API}/auth/google?returnTo=%2Fprofile`).expect(302);
    const consentUrl = new URL(start.headers['location'] ?? '');
    expect(consentUrl.pathname).toBe(`${API}/auth/google/mock-consent`);
    const state = consentUrl.searchParams.get('state') ?? '';

    const consent = await agent.get(`${consentUrl.pathname}${consentUrl.search}`).expect(200);
    expect(consent.headers['content-type']).toContain('text/html');
    expect(consent.headers['content-security-policy']).toContain("form-action 'self'");
    expect(consent.text).toContain(`value="${state}"`);
    expect(consent.text).not.toContain('<script');

    const email = `mock-${Date.now().toString(36)}@example.com`;
    const callback = await agent
      .get(`${API}/auth/google/callback?state=${state}&code=${encodeURIComponent(email)}`)
      .expect(302);
    expect(callback.headers['location']).toBe(`${APP}/profile`);

    const session = await agent.get(`${API}/auth/session`).expect(200);
    const user = (session.body as { user: { email: string; providers: string[] } }).user;
    expect(user.email).toBe(email);
    expect(user.providers).toContain('google');
  });

  it('rejects a malformed state on the consent page', async () => {
    await ctx.agent().get(`${API}/auth/google/mock-consent?state=%22%3E%3Cscript%3E`).expect(400);
  });

  it('fails the callback when the code is not an email', async () => {
    const agent = ctx.agent();
    const start = await agent.get(`${API}/auth/google`).expect(302);
    const state = new URL(start.headers['location'] ?? '').searchParams.get('state') ?? '';

    const res = await agent.get(`${API}/auth/google/callback?state=${state}&code=nope`).expect(302);
    expect(res.headers['location']).toBe(`${APP}/login?error=oauth_failed`);
  });
});
