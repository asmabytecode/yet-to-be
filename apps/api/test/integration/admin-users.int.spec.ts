import {
  type AdminUserDetailDto,
  type AdminUserDto,
  type AuditEntryDto,
  ERROR_CODES,
  type ListResponse,
} from '@yet-to-be/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditService } from '../../src/modules/audit';
import { ADMIN_ROLE_ID, OwnerBootstrapService } from '../../src/modules/iam';
import { FakeOAuthProvider } from '../fake-oauth-provider';
import {
  API,
  type AuthSession,
  cookieValue,
  createTestApp,
  enableMfa,
  PASSWORD,
  signIn,
  signUp,
  stepUp,
  type TestApp,
} from '../test-app';

const codeOf = (body: unknown): string => (body as { code: string }).code;

describe('admin: users, blocking and audit log (integration)', () => {
  let ctx: TestApp;
  const provider = new FakeOAuthProvider();
  let counter = 0;
  const email = (): string => `adm${String((counter += 1))}@example.com`;

  let owner: AuthSession;
  let ownerId: string;
  let admin: AuthSession & { email: string; id: string };

  const post = (session: AuthSession, path: string, body?: object) =>
    session.agent.post(`${API}${path}`).set('X-CSRF-Token', session.csrf).send(body);

  async function idOf(session: AuthSession): Promise<string> {
    return (
      (await session.agent.get(`${API}/auth/session`).expect(200)).body as { user: { id: string } }
    ).user.id;
  }

  async function member(): Promise<AuthSession & { email: string; id: string }> {
    const address = email();
    const session = await signUp(ctx, address);
    await post(owner, '/admin/members', { email: address, roleId: ADMIN_ROLE_ID }).expect(204);
    return { ...session, email: address, id: await idOf(session) };
  }

  async function regular(): Promise<AuthSession & { email: string; id: string }> {
    const address = email();
    const session = await signUp(ctx, address);
    return { ...session, email: address, id: await idOf(session) };
  }

  beforeAll(async () => {
    ctx = await createTestApp([], provider);
    const ownerEmail = email();
    owner = await signUp(ctx, ownerEmail);
    ownerId = await idOf(owner);
    await ctx.app.get(OwnerBootstrapService).grantOwner(ownerEmail);
    await enableMfa(owner);
    admin = await member();
  });
  afterAll(async () => {
    await ctx.close();
  });

  describe('listing and details', () => {
    it('lists users with filters; regular users are refused', async () => {
      const someone = await regular();
      const list = await admin.agent.get(`${API}/admin/users?limit=100`).expect(200);
      const items = (list.body as ListResponse<AdminUserDto>).items;
      expect(items.find((item) => item.id === admin.id)?.roles).toEqual(['admin']);
      expect(JSON.stringify(list.body)).not.toContain('@example.com');

      const byEmail = await admin.agent
        .get(`${API}/admin/users?email=${encodeURIComponent(someone.email)}`)
        .expect(200);
      expect((byEmail.body as ListResponse<AdminUserDto>).items.map((item) => item.id)).toEqual([
        someone.id,
      ]);
      const byRole = await admin.agent.get(`${API}/admin/users?role=admin`).expect(200);
      expect(
        (byRole.body as ListResponse<AdminUserDto>).items.every((item) =>
          item.roles.includes('admin'),
        ),
      ).toBe(true);

      await someone.agent.get(`${API}/admin/users`).expect(403);
      await admin.agent
        .get(`${API}/admin/users?q=A&email=${encodeURIComponent(someone.email)}`)
        .expect(400);
    });

    it('shows the email only with users:read_pii and logs that view', async () => {
      const someone = await regular();
      const asAdmin = await admin.agent.get(`${API}/admin/users/${someone.id}`).expect(200);
      expect((asAdmin.body as AdminUserDetailDto).email).toBeNull();

      const asOwner = await owner.agent.get(`${API}/admin/users/${someone.id}`).expect(200);
      expect((asOwner.body as AdminUserDetailDto).email).toBe(someone.email);
      const views = await ctx.db.prisma.auditLog.findMany({
        where: { action: 'admin.user.view_pii', targetId: someone.id },
      });
      expect(views).toHaveLength(1);
      expect(views[0]?.actorId).toBe(ownerId);
    });
  });

  describe('blocking', () => {
    it('blocks a user: sessions die at once, login is refused only after a correct password', async () => {
      const victim = await regular();
      await victim.agent.get(`${API}/auth/session`).expect(200);

      const short = await post(admin, `/admin/users/${victim.id}/block`, { reason: 'spam' }).expect(
        400,
      );
      expect(codeOf(short.body)).toBe(ERROR_CODES.VALIDATION_FAILED);
      await post(admin, `/admin/users/${victim.id}/block`, { reason: 'Spam in comments' }).expect(
        204,
      );

      // Наявний access-токен більше не працює, refresh теж.
      await victim.agent.get(`${API}/auth/session`).expect(401);
      await post(victim, '/auth/refresh').expect(401);

      const ok = await signIn(ctx, victim.email);
      expect(ok.res.status).toBe(403);
      expect(codeOf(ok.res.body)).toBe(ERROR_CODES.ACCOUNT_BLOCKED);
      const wrong = await signIn(ctx, victim.email, 'not the right password');
      expect(wrong.res.status).toBe(401);
      expect(codeOf(wrong.res.body)).toBe(ERROR_CODES.AUTH_INVALID_CREDENTIALS);

      const detail = (await owner.agent.get(`${API}/admin/users/${victim.id}`).expect(200))
        .body as AdminUserDetailDto;
      expect(detail).toMatchObject({ status: 'blocked', blockReason: 'Spam in comments' });

      // Ідемпотентно: повторне блокування нічого не змінює.
      await post(admin, `/admin/users/${victim.id}/block`, {
        reason: 'Another reason here',
      }).expect(204);
      const again = (await owner.agent.get(`${API}/admin/users/${victim.id}`).expect(200))
        .body as AdminUserDetailDto;
      expect(again.blockReason).toBe('Spam in comments');
      expect(again.blockedAt).toBe(detail.blockedAt);

      await post(admin, `/admin/users/${victim.id}/unblock`).expect(204);
      expect((await signIn(ctx, victim.email, PASSWORD)).res.status).toBe(200);
    });

    it('records the block in the same transaction, with the request id', async () => {
      const victim = await regular();
      const res = await post(admin, `/admin/users/${victim.id}/block`, {
        reason: 'Abusive behaviour',
      }).expect(204);
      const entry = await ctx.db.prisma.auditLog.findFirstOrThrow({
        where: { action: 'admin.user.block', targetId: victim.id },
      });
      expect(entry.actorId).toBe(admin.id);
      expect(entry.requestId).toBe(res.headers['x-request-id']);
    });

    it('refuses to block yourself or the owner', async () => {
      const self = await post(admin, `/admin/users/${admin.id}/block`, {
        reason: 'Testing myself',
      }).expect(403);
      expect(codeOf(self.body)).toBe(ERROR_CODES.IAM_SELF_MODIFICATION);
      const ownerBlock = await post(admin, `/admin/users/${ownerId}/block`, {
        reason: 'Trying the owner',
      }).expect(403);
      expect(codeOf(ownerBlock.body)).toBe(ERROR_CODES.IAM_SYSTEM_ROLE);
    });

    it('blocking a team member needs equal permissions and a fresh step-up', async () => {
      const colleague = await member();
      const stale = await post(admin, `/admin/users/${colleague.id}/block`, {
        reason: 'Compromised account',
      }).expect(403);
      expect(codeOf(stale.body)).toBe(ERROR_CODES.REAUTH_REQUIRED);
      await stepUp(admin);
      await post(admin, `/admin/users/${colleague.id}/block`, {
        reason: 'Compromised account',
      }).expect(204);
    });

    it('validates ids', async () => {
      await post(admin, '/admin/users/not-a-uuid/block', { reason: 'Some long reason' }).expect(
        400,
      );
      await admin.agent.get(`${API}/admin/users/00000000-0000-4000-8000-00000000ffff`).expect(404);
    });

    it('redirects a blocked Google user to the login page with a clear error', async () => {
      const address = email();
      provider.profile = {
        provider: 'google',
        subject: `blocked-${address}`,
        email: address,
        emailVerified: true,
        name: 'Blocked User',
      };
      const agent = ctx.agent();
      await agent.get(`${API}/auth/google`);
      await agent.get(`${API}/auth/google/callback?code=ok&state=state-123`).expect(302);
      const user = await ctx.db.prisma.user.findFirstOrThrow({
        where: { displayName: 'Blocked User' },
      });
      await post(admin, `/admin/users/${user.id}/block`, { reason: 'Fake account' }).expect(204);

      const again = ctx.agent();
      await again.get(`${API}/auth/google`);
      const res = await again
        .get(`${API}/auth/google/callback?code=ok&state=state-123`)
        .expect(302);
      expect(res.headers.location).toContain('/login?error=account_blocked');
      expect(cookieValue(res.headers['set-cookie'], 'ytb_at')).toBeUndefined();
    });
  });

  describe('audit log API', () => {
    it('filters entries and hides nothing about who did what', async () => {
      const res = await admin.agent
        .get(`${API}/admin/audit?action=admin.user.block&limit=5`)
        .expect(200);
      const page = res.body as ListResponse<AuditEntryDto>;
      expect(page.items.length).toBeGreaterThan(0);
      for (const item of page.items) {
        expect(item.action).toBe('admin.user.block');
        expect(item.actorName).not.toBeNull();
      }
      expect(JSON.stringify(page)).not.toContain('@example.com');
    });

    it('rejects bad filters and users without audit:read', async () => {
      await admin.agent
        .get(`${API}/admin/audit?action=${encodeURIComponent("x' OR 1=1")}`)
        .expect(400);
      await admin.agent.get(`${API}/admin/audit?from=yesterday`).expect(400);
      const someone = await regular();
      await someone.agent.get(`${API}/admin/audit`).expect(403);
    });

    it('has no way to change or delete entries over HTTP', async () => {
      const entry = await ctx.db.prisma.auditLog.findFirstOrThrow({
        where: { seq: { not: null } },
      });
      await owner.agent
        .delete(`${API}/admin/audit/${entry.id}`)
        .set('X-CSRF-Token', owner.csrf)
        .expect(404);
      await owner.agent
        .patch(`${API}/admin/audit/${entry.id}`)
        .set('X-CSRF-Token', owner.csrf)
        .send({})
        .expect(404);
    });

    it('keeps an intact hash chain over everything written in this suite', async () => {
      const verdict = await ctx.app.get(AuditService).verify();
      expect(verdict.ok).toBe(true);
      expect(verdict.checked).toBeGreaterThan(10);
    });
  });
});
