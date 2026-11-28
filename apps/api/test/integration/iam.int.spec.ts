import { METHOD_METADATA } from '@nestjs/common/constants';
import { ModulesContainer } from '@nestjs/core';
import { type AccessDto, ERROR_CODES, PERMISSIONS, type RoleDto } from '@yet-to-be/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ADMIN_ROLE_ID,
  OWNER_ROLE_ID,
  OwnerBootstrapService,
  PERMISSIONS_KEY,
} from '../../src/modules/iam';
import { ADMIN_ROUTE_KEY } from '../../src/platform/admin-controller';
import {
  API,
  type AuthSession,
  createTestApp,
  enableMfa,
  signUp,
  stepUp,
  type TestApp,
} from '../test-app';

const meta = (key: string, target: object): unknown => Reflect.getMetadata(key, target) as unknown;

describe('IAM: roles, permissions and admin routes (integration)', () => {
  let ctx: TestApp;
  let counter = 0;
  const email = (): string => `iam${String((counter += 1))}@example.com`;

  let owner: AuthSession;

  beforeAll(async () => {
    ctx = await createTestApp();
    const ownerEmail = email();
    owner = await signUp(ctx, ownerEmail);
    await ctx.app.get(OwnerBootstrapService).grantOwner(ownerEmail);
    // Роль owner вимагає MFA; увімкнення заодно дає свіжий step-up для критичних дій.
    await enableMfa(owner);
  });
  afterAll(async () => {
    await ctx.close();
  });

  async function user(): Promise<AuthSession & { email: string }> {
    const address = email();
    return { ...(await signUp(ctx, address)), email: address };
  }

  function createRole(session: AuthSession, body: Record<string, unknown>) {
    return session.agent.post(`${API}/admin/roles`).set('X-CSRF-Token', session.csrf).send(body);
  }

  function grant(session: AuthSession, address: string, roleId: string) {
    return session.agent
      .post(`${API}/admin/members`)
      .set('X-CSRF-Token', session.csrf)
      .send({ email: address, roleId });
  }

  async function accessOf(session: AuthSession): Promise<AccessDto> {
    const res = await session.agent.get(`${API}/auth/session`).expect(200);
    return (res.body as { access: AccessDto }).access;
  }

  const codeOf = (body: unknown): string => (body as { code: string }).code;

  it('every admin route declares @RequirePermission (deny-by-default guard)', () => {
    const routes: string[] = [];
    const missing: string[] = [];
    for (const module of ctx.app.get(ModulesContainer).values()) {
      for (const wrapper of module.controllers.values()) {
        const type = wrapper.metatype;
        if (type === null || meta(ADMIN_ROUTE_KEY, type) !== true) continue;
        const proto = (type as unknown as { prototype: Record<string, unknown> }).prototype;
        for (const name of Object.getOwnPropertyNames(proto)) {
          const handler = proto[name];
          if (name === 'constructor' || typeof handler !== 'function') continue;
          if (meta(METHOD_METADATA, handler) === undefined) continue;
          routes.push(`${type.name}.${name}`);
          if (
            meta(PERMISSIONS_KEY, handler) === undefined &&
            meta(PERMISSIONS_KEY, type) === undefined
          ) {
            missing.push(`${type.name}.${name}`);
          }
        }
      }
    }
    expect(routes.length).toBeGreaterThan(0);
    expect(missing).toEqual([]);
  });

  describe('migration seed', () => {
    it('creates the system roles; admin has a starter set, owner gets everything in code', async () => {
      const roles = await ctx.db.prisma.role.findMany({ include: { permissions: true } });
      const byId = new Map(roles.map((role) => [role.id, role]));
      expect(byId.get(OWNER_ROLE_ID)?.key).toBe('owner');
      expect(byId.get(OWNER_ROLE_ID)?.isSystem).toBe(true);
      expect(byId.get(ADMIN_ROLE_ID)?.permissions.map((p) => p.permission)).toContain(
        'events:write',
      );
      expect(byId.get(ADMIN_ROLE_ID)?.permissions.map((p) => p.permission)).not.toContain(
        'roles:manage',
      );
    });
  });

  describe('owner bootstrap', () => {
    it('is idempotent for the owner and refuses a second owner or unknown users', async () => {
      const service = ctx.app.get(OwnerBootstrapService);
      const other = await user();
      await expect(service.grantOwner(other.email)).rejects.toMatchObject({
        code: ERROR_CODES.IAM_OWNER_EXISTS,
      });
      await expect(service.grantOwner('nobody@example.com')).rejects.toMatchObject({
        code: ERROR_CODES.NOT_FOUND,
      });
      expect(await ctx.db.prisma.userRole.count({ where: { roleId: OWNER_ROLE_ID } })).toBe(1);
    });
  });

  describe('session access', () => {
    it('gives a regular user no permissions and the owner the whole catalog', async () => {
      const regular = await user();
      expect(await accessOf(regular)).toEqual({ roles: [], permissions: [], isOwner: false });

      const ownerAccess = await accessOf(owner);
      expect(ownerAccess.isOwner).toBe(true);
      expect(ownerAccess.permissions).toEqual([...PERMISSIONS].sort());
    });
  });

  describe('authorization matrix', () => {
    it('anonymous → 401, user without roles → 403 and an access_denied audit entry', async () => {
      await ctx.agent().get(`${API}/admin/roles`).expect(401);

      const regular = await user();
      const res = await regular.agent.get(`${API}/admin/roles`).expect(403);
      expect(codeOf(res.body)).toBe(ERROR_CODES.FORBIDDEN);
      const denied = await ctx.db.prisma.auditLog.findMany({
        where: { action: 'admin.access_denied' },
      });
      expect(denied.length).toBeGreaterThan(0);
      expect(denied.at(-1)?.metadata).not.toContain('@example.com');
    });

    it('mutations require a CSRF token even for the owner', async () => {
      const res = await owner.agent
        .post(`${API}/admin/roles`)
        .send({ key: 'nocsrf', name: 'No CSRF', permissions: ['events:read'] })
        .expect(403);
      expect(codeOf(res.body)).toBe(ERROR_CODES.CSRF_INVALID);
    });

    it('a granted role takes effect on the next request without re-login', async () => {
      const created = await createRole(owner, {
        key: 'editor',
        name: 'Редактор',
        permissions: ['events:read', 'events:write'],
      }).expect(201);
      const role = created.body as RoleDto;
      expect(role).toMatchObject({ key: 'editor', isSystem: false, memberCount: 0 });

      const member = await user();
      await grant(owner, member.email, role.id).expect(204);
      expect((await accessOf(member)).permissions).toEqual(['events:read', 'events:write']);
      // У редактора немає roles:read.
      await member.agent.get(`${API}/admin/roles`).expect(403);

      const assignment = await ctx.db.prisma.userRole.findFirstOrThrow({
        where: { roleId: role.id },
      });
      await owner.agent
        .delete(`${API}/admin/members/${assignment.userId}/roles/${role.id}`)
        .set('X-CSRF-Token', owner.csrf)
        .expect(204);
      expect((await accessOf(member)).permissions).toEqual([]);
    });
  });

  describe('anti-escalation', () => {
    let manager: AuthSession & { email: string };
    let managerRoleId: string;

    beforeAll(async () => {
      const created = await createRole(owner, {
        key: 'manager',
        name: 'Менеджер команди',
        permissions: ['roles:read', 'roles:manage', 'events:read'],
      }).expect(201);
      managerRoleId = (created.body as RoleDto).id;
      manager = await user();
      await grant(owner, manager.email, managerRoleId).expect(204);
      await stepUp(manager);
    });

    it('cannot create a role stronger than itself, but can create a weaker one', async () => {
      const stronger = await createRole(manager, {
        key: 'auditor',
        name: 'Аудитор',
        permissions: ['audit:read'],
      }).expect(403);
      expect(codeOf(stronger.body)).toBe(ERROR_CODES.IAM_ESCALATION);
      await createRole(manager, {
        key: 'viewer',
        name: 'Глядач',
        permissions: ['events:read'],
      }).expect(201);
    });

    it('cannot change its own roles or touch the owner', async () => {
      const self = await grant(manager, manager.email, managerRoleId).expect(403);
      expect(codeOf(self.body)).toBe(ERROR_CODES.IAM_SELF_MODIFICATION);

      const ownerRow = await ctx.db.prisma.userRole.findFirstOrThrow({
        where: { roleId: OWNER_ROLE_ID },
      });
      const revokeOwner = await manager.agent
        .delete(`${API}/admin/members/${ownerRow.userId}/roles/${OWNER_ROLE_ID}`)
        .set('X-CSRF-Token', manager.csrf)
        .expect(403);
      expect(codeOf(revokeOwner.body)).toBe(ERROR_CODES.IAM_SYSTEM_ROLE);
    });

    it('cannot edit the system admin role or grant the owner role', async () => {
      const edit = await manager.agent
        .patch(`${API}/admin/roles/${ADMIN_ROLE_ID}`)
        .set('X-CSRF-Token', manager.csrf)
        .send({ name: 'Хакнутий' })
        .expect(403);
      expect(codeOf(edit.body)).toBe(ERROR_CODES.IAM_SYSTEM_ROLE);

      const target = await user();
      const ownerGrant = await grant(manager, target.email, OWNER_ROLE_ID).expect(403);
      expect(codeOf(ownerGrant.body)).toBe(ERROR_CODES.IAM_SYSTEM_ROLE);
    });

    it('records role changes in the audit log without PII', async () => {
      const entries = await ctx.db.prisma.auditLog.findMany({
        where: { action: { in: ['admin.role.create', 'admin.role.grant'] } },
      });
      expect(entries.length).toBeGreaterThanOrEqual(2);
      for (const entry of entries) {
        expect(entry.metadata ?? '').not.toMatch(/@example\.com/);
      }
    });
  });

  describe('role lifecycle', () => {
    it('refuses to delete a role in use, deletes it after revoking', async () => {
      const role = (
        await createRole(owner, {
          key: 'temp',
          name: 'Тимчасова',
          permissions: ['events:read'],
        }).expect(201)
      ).body as RoleDto;
      const member = await user();
      await grant(owner, member.email, role.id).expect(204);
      // Повторна видача ідемпотентна.
      await grant(owner, member.email, role.id).expect(204);

      const inUse = await owner.agent
        .delete(`${API}/admin/roles/${role.id}`)
        .set('X-CSRF-Token', owner.csrf)
        .expect(409);
      expect(codeOf(inUse.body)).toBe(ERROR_CODES.IAM_ROLE_IN_USE);

      const row = await ctx.db.prisma.userRole.findFirstOrThrow({ where: { roleId: role.id } });
      await owner.agent
        .delete(`${API}/admin/members/${row.userId}/roles/${role.id}`)
        .set('X-CSRF-Token', owner.csrf)
        .expect(204);
      await owner.agent
        .delete(`${API}/admin/roles/${role.id}`)
        .set('X-CSRF-Token', owner.csrf)
        .expect(204);
    });

    it('rejects duplicate keys, system keys and the system roles deletion', async () => {
      expect(
        codeOf(
          (
            await createRole(owner, {
              key: 'admin',
              name: 'Дубль',
              permissions: ['events:read'],
            }).expect(409)
          ).body,
        ),
      ).toBe(ERROR_CODES.CONFLICT);
      const del = await owner.agent
        .delete(`${API}/admin/roles/${ADMIN_ROLE_ID}`)
        .set('X-CSRF-Token', owner.csrf)
        .expect(403);
      expect(codeOf(del.body)).toBe(ERROR_CODES.IAM_SYSTEM_ROLE);
    });
  });

  describe('input validation', () => {
    it.each([
      ['unknown field', { key: 'x1', name: 'X', permissions: ['events:read'], isSystem: true }],
      ['wildcard permission', { key: 'x2', name: 'Wild', permissions: ['*'] }],
      [
        'bidi override in the name',
        { key: 'x3', name: 'Ad\u202Emin', permissions: ['events:read'] },
      ],
      ['uppercase key', { key: 'Admin2', name: 'Admin', permissions: ['events:read'] }],
    ])('rejects %s with 400', async (_name, body) => {
      const res = await createRole(owner, body).expect(400);
      expect(codeOf(res.body)).toBe(ERROR_CODES.VALIDATION_FAILED);
    });

    it('validates ids and pagination parameters', async () => {
      await owner.agent
        .patch(`${API}/admin/roles/not-a-uuid`)
        .set('X-CSRF-Token', owner.csrf)
        .send({ name: 'Xx' })
        .expect(400);
      await owner.agent.get(`${API}/admin/members?limit=1000`).expect(400);
      await owner.agent
        .get(`${API}/admin/members?cursor=${encodeURIComponent("' OR 1=1")}`)
        .expect(400);
      await owner.agent.get(`${API}/admin/members?sort=password`).expect(400);
    });

    it('paginates members with a cursor', async () => {
      const first = await owner.agent.get(`${API}/admin/members?limit=1`).expect(200);
      const page = first.body as { items: unknown[]; nextCursor: string | null };
      expect(page.items).toHaveLength(1);
      expect(page.nextCursor).not.toBeNull();
      const second = await owner.agent
        .get(`${API}/admin/members?limit=1&cursor=${page.nextCursor ?? ''}`)
        .expect(200);
      expect((second.body as { items: { userId: string }[] }).items[0]?.userId).not.toBe(
        (page.items[0] as { userId: string }).userId,
      );
    });
  });
});
