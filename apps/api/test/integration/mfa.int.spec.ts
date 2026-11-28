import { ERROR_CODES, type MfaStatus } from '@yet-to-be/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OwnerBootstrapService, totp } from '../../src/modules/iam';
import {
  API,
  type AuthSession,
  cookieValue,
  createTestApp,
  enableMfa,
  signIn,
  signUp,
  type TestApp,
} from '../test-app';

const codeOf = (body: unknown): string => (body as { code: string }).code;
/** Код наступного 30-секундного кроку: поточний уже використано під час enable. */
const nextCode = (secret: string, steps = 1): string => totp(secret, Date.now() + steps * 30_000);

describe('MFA and step-up (integration)', () => {
  let ctx: TestApp;
  let counter = 0;
  const email = (): string => `mfa${String((counter += 1))}@example.com`;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.close();
  });

  const post = (session: AuthSession, path: string, body?: object) =>
    session.agent.post(`${API}${path}`).set('X-CSRF-Token', session.csrf).send(body);

  async function status(session: AuthSession): Promise<MfaStatus> {
    return (await session.agent.get(`${API}/auth/mfa`).expect(200)).body as MfaStatus;
  }

  describe('enrolment for a regular user', () => {
    let session: AuthSession;
    let secret: string;

    beforeAll(async () => {
      session = await signUp(ctx, email());
    });

    it('starts disabled and not required', async () => {
      expect(await status(session)).toEqual({
        enabled: false,
        required: false,
        sessionVerified: false,
        stepUpUntil: null,
      });
    });

    it('rejects a wrong code, then enables MFA and returns 10 one-time recovery codes', async () => {
      const setup = await post(session, '/auth/mfa/setup').expect(200);
      secret = (setup.body as { secret: string; otpauthUri: string }).secret;
      expect((setup.body as { otpauthUri: string }).otpauthUri).toMatch(/^otpauth:\/\/totp\//);

      const wrong = totp(secret, Date.now()) === '000000' ? '111111' : '000000';
      const bad = await post(session, '/auth/mfa/enable', { code: wrong }).expect(400);
      expect(codeOf(bad.body)).toBe(ERROR_CODES.MFA_INVALID_CODE);

      const ok = await post(session, '/auth/mfa/enable', { code: totp(secret, Date.now()) }).expect(
        200,
      );
      const { recoveryCodes } = ok.body as { recoveryCodes: string[] };
      expect(recoveryCodes).toHaveLength(10);
      expect(new Set(recoveryCodes).size).toBe(10);

      const stored = await ctx.db.prisma.userMfa.findFirstOrThrow({
        where: { enabledAt: { not: null } },
      });
      expect(stored.secretEncrypted).not.toContain(secret);
      const hashes = await ctx.db.prisma.mfaRecoveryCode.findMany({
        where: { userId: stored.userId },
      });
      expect(hashes.every((row) => !recoveryCodes.includes(row.codeHash))).toBe(true);

      (session as AuthSession & { recovery?: string[] }).recovery = recoveryCodes;
      expect((await status(session)).sessionVerified).toBe(true);
    });

    it('refuses a second setup while enabled', async () => {
      const res = await post(session, '/auth/mfa/setup').expect(409);
      expect(codeOf(res.body)).toBe(ERROR_CODES.MFA_ALREADY_ENABLED);
    });

    it('rejects a replayed code and accepts the next one', async () => {
      await post(session, '/auth/mfa/verify', { code: totp(secret, Date.now()) }).expect(400);
      await post(session, '/auth/mfa/verify', { code: nextCode(secret) }).expect(204);
    });

    it('accepts each recovery code only once', async () => {
      const recovery = (session as AuthSession & { recovery?: string[] }).recovery ?? [];
      const first = recovery[0] ?? '';
      await post(session, '/auth/mfa/verify', { recoveryCode: first.toLowerCase() }).expect(204);
      await post(session, '/auth/mfa/verify', { recoveryCode: first }).expect(400);
    });

    it('validates input strictly', async () => {
      await post(session, '/auth/mfa/verify', { code: '12ab56' }).expect(400);
      await post(session, '/auth/mfa/verify', {
        code: '123456',
        recoveryCode: 'ABCDE-FGHIJ',
      }).expect(400);
    });

    it('can be disabled with a valid code when no role requires it', async () => {
      await post(session, '/auth/mfa/disable', { code: nextCode(secret, -1) }).expect(400);
      // Поточний і наступний кроки вже використані вище; скидаємо лічильник, щоб узяти свіжий код.
      await ctx.db.prisma.userMfa.updateMany({ data: { lastUsedStep: null } });
      await post(session, '/auth/mfa/disable', { code: totp(secret, Date.now()) }).expect(204);
      expect((await status(session)).enabled).toBe(false);
    });
  });

  describe('enforcement for roles that require MFA', () => {
    const ownerEmail = `owner-mfa@example.com`;
    let first: AuthSession;
    let secret: string;

    beforeAll(async () => {
      first = await signUp(ctx, ownerEmail);
      await ctx.app.get(OwnerBootstrapService).grantOwner(ownerEmail);
    });

    it('requires setup, then accepts the session that enabled MFA', async () => {
      const blocked = await first.agent.get(`${API}/admin/roles`).expect(403);
      expect(codeOf(blocked.body)).toBe(ERROR_CODES.MFA_SETUP_REQUIRED);
      secret = await enableMfa(first);
      await first.agent.get(`${API}/admin/roles`).expect(200);
      expect((await status(first)).required).toBe(true);
    });

    it('keeps MFA verification across refresh-token rotation', async () => {
      const res = await post(first, '/auth/refresh').expect(200);
      first.csrf = cookieValue(res.headers['set-cookie'], 'ytb_csrf') ?? first.csrf;
      await first.agent.get(`${API}/admin/roles`).expect(200);
    });

    it('asks a new session for a code', async () => {
      const second = await signIn(ctx, ownerEmail);
      const res = await second.agent.get(`${API}/admin/roles`).expect(403);
      expect(codeOf(res.body)).toBe(ERROR_CODES.MFA_REQUIRED);
      await post(second, '/auth/mfa/verify', { code: nextCode(secret) }).expect(204);
      await second.agent.get(`${API}/admin/roles`).expect(200);
    });

    it('cannot disable MFA required by the role', async () => {
      const res = await post(first, '/auth/mfa/disable', { code: nextCode(secret, 2) }).expect(409);
      expect(codeOf(res.body)).toBe(ERROR_CODES.MFA_REQUIRED_BY_ROLE);
    });

    it('requires a fresh step-up for critical actions', async () => {
      const target = email();
      await signUp(ctx, target);
      const roleId = '00000000-0000-4000-8000-000000000002';
      const staleAt = new Date(Date.now() - 10 * 60_000);
      await ctx.db.prisma.session.updateMany({
        where: { revokedAt: null, mfaVerifiedAt: { not: null } },
        data: { stepUpAt: staleAt },
      });

      const stale = await post(first, '/admin/members', { email: target, roleId }).expect(403);
      expect(codeOf(stale.body)).toBe(ERROR_CODES.REAUTH_REQUIRED);

      const wrong = await post(first, '/auth/step-up', { password: 'wrong password!' }).expect(400);
      expect(codeOf(wrong.body)).toBe(ERROR_CODES.AUTH_INVALID_CREDENTIALS);

      await post(first, '/auth/step-up', { password: 'correct horse battery staple' }).expect(204);
      expect((await status(first)).stepUpUntil).not.toBeNull();
      await post(first, '/admin/members', { email: target, roleId }).expect(204);
    });

    it('writes MFA events to the audit log', async () => {
      const actions = (await ctx.db.prisma.auditLog.findMany({ select: { action: true } })).map(
        (row) => row.action,
      );
      for (const action of [
        'mfa.setup',
        'mfa.enable',
        'mfa.verify',
        'mfa.failed',
        'auth.step_up',
      ]) {
        expect(actions).toContain(action);
      }
    });
  });
});
