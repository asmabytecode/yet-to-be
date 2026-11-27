import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '@yet-to-be/shared';
import { FakeOAuthProvider } from './fake-oauth-provider';
import { API, createTestApp, PASSWORD, signIn, signUp, type TestApp } from './test-app';

describe('users/me (e2e)', () => {
  let ctx: TestApp;
  const provider = new FakeOAuthProvider();
  let counter = 0;
  const email = (): string => `profile${String((counter += 1))}@example.com`;

  beforeAll(async () => {
    ctx = await createTestApp([], provider);
  });
  afterAll(async () => {
    await ctx.close();
  });

  /** Користувач, створений лише через Google (без пароля). */
  async function googleUser() {
    provider.profile = {
      provider: 'google',
      subject: `sub-${String((counter += 1))}`,
      email: email(),
      emailVerified: true,
      name: 'Grace Hopper',
    };
    const agent = ctx.agent();
    await agent.get(`${API}/auth/google`);
    await agent.get(`${API}/auth/google/callback?code=ok&state=state-123`);
    const csrf = ((await agent.get(`${API}/auth/csrf`)).body as { csrfToken: string }).csrfToken;
    return { agent, csrf, email: provider.profile.email };
  }

  describe('GET and PATCH', () => {
    it('requires authentication', async () => {
      await ctx.agent().get(`${API}/users/me`).expect(401);
      await ctx.agent().get(`${API}/users/me/sessions`).expect(401);
    });

    it('returns the current user with a stable set of keys (no secrets)', async () => {
      const { agent } = await signUp(ctx, email());
      const res = await agent.get(`${API}/users/me`).expect(200);
      expect(Object.keys(res.body as object).sort()).toEqual([
        'avatarUrl',
        'bio',
        'createdAt',
        'displayName',
        'email',
        'firstName',
        'id',
        'lastName',
        'providers',
      ]);
    });

    it('updates only allowed fields and stores names encrypted', async () => {
      const { agent, csrf } = await signUp(ctx, email());
      const res = await agent
        .patch(`${API}/users/me`)
        .set('X-CSRF-Token', csrf)
        .send({ displayName: 'Ada L', firstName: 'Ada', lastName: 'Lovelace', bio: 'Maths\nand poetry' })
        .expect(200);
      expect(res.body).toMatchObject({
        displayName: 'Ada L',
        firstName: 'Ada',
        lastName: 'Lovelace',
        bio: 'Maths\nand poetry',
      });

      const rows = await ctx.db.prisma.user.findMany({ where: { displayName: 'Ada L' } });
      expect(rows).toHaveLength(1);
      expect(rows[0]?.firstNameEncrypted?.startsWith('v1:k1:')).toBe(true);
      expect(rows[0]?.firstNameEncrypted).not.toContain('Ada');
      expect(rows[0]?.lastNameEncrypted).not.toContain('Lovelace');
    });

    it('clears optional fields with an empty string', async () => {
      const { agent, csrf } = await signUp(ctx, email());
      await agent.patch(`${API}/users/me`).set('X-CSRF-Token', csrf).send({ firstName: 'Ada', bio: 'x' });
      const res = await agent
        .patch(`${API}/users/me`)
        .set('X-CSRF-Token', csrf)
        .send({ firstName: '', bio: '' })
        .expect(200);
      expect(res.body).toMatchObject({ firstName: null, bio: null });
    });

    it('rejects fields outside the allowlist (mass assignment)', async () => {
      const { agent, csrf } = await signUp(ctx, email());
      for (const forbidden of [
        { passwordHash: 'x' },
        { email: 'new@example.com' },
        { id: 'abc' },
        { status: 'admin' },
      ]) {
        const res = await agent
          .patch(`${API}/users/me`)
          .set('X-CSRF-Token', csrf)
          .send({ displayName: 'Ada', ...forbidden });
        expect(res.status).toBe(400);
        expect((res.body as { code: string }).code).toBe(ERROR_CODES.VALIDATION_FAILED);
      }
    });

    it('requires a CSRF token', async () => {
      const { agent } = await signUp(ctx, email());
      await agent.patch(`${API}/users/me`).send({ displayName: 'Ada' }).expect(403);
    });
  });

  describe('password', () => {
    it('changes the password, revokes other sessions and keeps the current one', async () => {
      const address = email();
      const first = await signUp(ctx, address);
      const second = await signIn(ctx, address);
      await second.agent.get(`${API}/auth/session`).expect(200);

      await first.agent
        .put(`${API}/users/me/password`)
        .set('X-CSRF-Token', first.csrf)
        .send({ currentPassword: PASSWORD, newPassword: 'a brand new passphrase' })
        .expect(204);

      await first.agent.get(`${API}/auth/session`).expect(200);
      await second.agent.get(`${API}/auth/session`).expect(401);
      expect((await signIn(ctx, address)).res.status).toBe(401);
      expect((await signIn(ctx, address, 'a brand new passphrase')).res.status).toBe(200);
      const actions = (await ctx.db.prisma.auditLog.findMany()).map((a) => a.action);
      expect(actions).toContain('user.password_changed');
    });

    it('rejects a wrong current password with 400 (not 401) and does not change anything', async () => {
      const address = email();
      const { agent, csrf } = await signUp(ctx, address);
      const res = await agent
        .put(`${API}/users/me/password`)
        .set('X-CSRF-Token', csrf)
        .send({ currentPassword: 'wrong password!!', newPassword: 'a brand new passphrase' });
      expect(res.status).toBe(400);
      expect((res.body as { code: string }).code).toBe(ERROR_CODES.AUTH_INVALID_CREDENTIALS);
      expect((await signIn(ctx, address)).res.status).toBe(200);
    });

    it('rejects a new password equal to the old one or too easy', async () => {
      const { agent, csrf } = await signUp(ctx, email());
      const same = await agent
        .put(`${API}/users/me/password`)
        .set('X-CSRF-Token', csrf)
        .send({ currentPassword: PASSWORD, newPassword: PASSWORD });
      expect(same.status).toBe(400);

      const weak = await agent
        .put(`${API}/users/me/password`)
        .set('X-CSRF-Token', csrf)
        .send({ currentPassword: PASSWORD, newPassword: 'password123' });
      expect(weak.status).toBe(400);
      expect((weak.body as { code: string }).code).toBe(ERROR_CODES.AUTH_WEAK_PASSWORD);
    });

    it('lets a Google-only account set a password once', async () => {
      const user = await googleUser();
      const res = await user.agent
        .post(`${API}/users/me/password`)
        .set('X-CSRF-Token', user.csrf)
        .send({ newPassword: 'my very own passphrase' });
      expect(res.status).toBe(204);
      expect((await signIn(ctx, user.email, 'my very own passphrase')).res.status).toBe(200);

      const again = await user.agent
        .post(`${API}/users/me/password`)
        .set('X-CSRF-Token', user.csrf)
        .send({ newPassword: 'another passphrase here' });
      expect(again.status).toBe(409);
      expect((again.body as { code: string }).code).toBe(ERROR_CODES.AUTH_PASSWORD_ALREADY_SET);
    });

    it('does not allow changing a password that does not exist', async () => {
      const user = await googleUser();
      const res = await user.agent
        .put(`${API}/users/me/password`)
        .set('X-CSRF-Token', user.csrf)
        .send({ currentPassword: 'whatever', newPassword: 'my very own passphrase' });
      expect(res.status).toBe(409);
    });
  });

  describe('Google account link', () => {
    it('refuses to unlink Google when there is no password (409)', async () => {
      const user = await googleUser();
      const res = await user.agent.delete(`${API}/users/me/oauth/google`).set('X-CSRF-Token', user.csrf);
      expect(res.status).toBe(409);
      expect((res.body as { code: string }).code).toBe(ERROR_CODES.AUTH_LAST_LOGIN_METHOD);
    });

    it('unlinks Google once a password exists, and a second unlink is 404', async () => {
      const user = await googleUser();
      await user.agent
        .post(`${API}/users/me/password`)
        .set('X-CSRF-Token', user.csrf)
        .send({ newPassword: 'my very own passphrase' })
        .expect(204);
      await user.agent.delete(`${API}/users/me/oauth/google`).set('X-CSRF-Token', user.csrf).expect(204);

      const me = await user.agent.get(`${API}/users/me`).expect(200);
      expect((me.body as { providers: string[] }).providers).toEqual(['password']);
      await user.agent.delete(`${API}/users/me/oauth/google`).set('X-CSRF-Token', user.csrf).expect(404);
    });
  });

  describe('sessions', () => {
    it('lists active sessions and marks the current one', async () => {
      const address = email();
      const first = await signUp(ctx, address);
      await signIn(ctx, address);
      const res = await first.agent.get(`${API}/users/me/sessions`).expect(200);
      const list = res.body as { id: string; isCurrent: boolean; createdAt: string; lastUsedAt: string }[];
      expect(list).toHaveLength(2);
      expect(list.filter((s) => s.isCurrent)).toHaveLength(1);
      expect(Object.keys(list[0] ?? {}).sort()).toEqual(['createdAt', 'id', 'isCurrent', 'lastUsedAt', 'userAgent']);
    });

    it('revokes another session of the same user', async () => {
      const address = email();
      const first = await signUp(ctx, address);
      const second = await signIn(ctx, address);
      const list = (await first.agent.get(`${API}/users/me/sessions`)).body as { id: string; isCurrent: boolean }[];
      const other = list.find((s) => !s.isCurrent);

      await first.agent
        .delete(`${API}/users/me/sessions/${other?.id ?? ''}`)
        .set('X-CSRF-Token', first.csrf)
        .expect(204);
      await second.agent.get(`${API}/auth/session`).expect(401);
      await first.agent.get(`${API}/auth/session`).expect(200);
    });

    it("answers 404 for someone else's, unknown or malformed session ids (IDOR)", async () => {
      const mine = await signUp(ctx, email());
      const theirs = await signUp(ctx, email());
      const theirList = (await theirs.agent.get(`${API}/users/me/sessions`)).body as { id: string }[];
      const theirId = theirList[0]?.id ?? '';

      const foreign = await mine.agent
        .delete(`${API}/users/me/sessions/${theirId}`)
        .set('X-CSRF-Token', mine.csrf);
      expect(foreign.status).toBe(404);
      await theirs.agent.get(`${API}/auth/session`).expect(200);

      await mine.agent
        .delete(`${API}/users/me/sessions/00000000-0000-4000-8000-000000000000`)
        .set('X-CSRF-Token', mine.csrf)
        .expect(404);
      await mine.agent.delete(`${API}/users/me/sessions/not-a-uuid`).set('X-CSRF-Token', mine.csrf).expect(400);
    });
  });
});
