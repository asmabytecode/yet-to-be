import { ERROR_CODES, type Permission, PERMISSIONS } from '@yet-to-be/shared';
import { describe, expect, it } from 'vitest';
import { AppException } from '../../common/app-exception';
import { type Access, buildAccess } from './access';
import {
  assertCanChangeAssignment,
  assertCanCreateRole,
  assertCanDeleteRole,
  assertCanUpdateRole,
  covers,
  hasPermissions,
  type RoleShape,
} from './iam.policy';

function access(userId: string, keys: string[], permissions: Permission[]): Access {
  return buildAccess(
    userId,
    keys.map((key) => ({
      role: {
        key,
        requiresMfa: false,
        permissions: permissions.map((permission) => ({ permission })),
      },
    })),
  );
}

const owner = access('owner', ['owner'], []);
const manager = access(
  'manager',
  ['manager'],
  ['roles:read', 'roles:manage', 'events:read', 'events:write'],
);
const editor = access('editor', ['editor'], ['events:read', 'events:write']);
const nobody = access('nobody', [], []);

const editorRole: RoleShape = {
  key: 'editor',
  isSystem: false,
  permissions: ['events:read', 'events:write'],
};
const auditorRole: RoleShape = { key: 'auditor', isSystem: false, permissions: ['audit:read'] };
const adminRole: RoleShape = { key: 'admin', isSystem: true, permissions: ['events:read'] };
const ownerRole: RoleShape = { key: 'owner', isSystem: true, permissions: [] };

function codeOf(fn: () => void): string | null {
  try {
    fn();
    return null;
  } catch (error) {
    return error instanceof AppException ? error.code : 'unexpected';
  }
}

describe('buildAccess', () => {
  it('gives the owner every permission in the catalog', () => {
    expect(owner.isOwner).toBe(true);
    expect([...owner.permissions].sort()).toEqual([...PERMISSIONS].sort());
  });

  it('unions permissions of all roles and ignores unknown keys from the database', () => {
    const result = buildAccess('u', [
      { role: { key: 'a', requiresMfa: false, permissions: [{ permission: 'events:read' }] } },
      {
        role: {
          key: 'b',
          requiresMfa: true,
          permissions: [{ permission: 'audit:read' }, { permission: 'legacy:everything' }],
        },
      },
    ]);
    expect([...result.permissions].sort()).toEqual(['audit:read', 'events:read']);
    expect(result.requiresMfa).toBe(true);
    expect(result.isOwner).toBe(false);
  });

  it('gives a user without roles nothing', () => {
    expect(nobody.permissions.size).toBe(0);
  });
});

describe('hasPermissions / covers', () => {
  it.each([
    ['owner', owner, ['audit:read', 'roles:manage'], true],
    ['manager with all', manager, ['roles:manage', 'events:read'], true],
    ['manager missing one', manager, ['roles:manage', 'audit:read'], false],
    ['editor', editor, ['events:write'], true],
    ['nobody', nobody, ['events:read'], false],
  ] as const)('%s', (_name, actor, required, expected) => {
    expect(hasPermissions(actor, required)).toBe(expected);
    expect(covers(actor, required)).toBe(expected);
  });
});

describe('role management (anti-escalation)', () => {
  it.each([
    ['owner creates any role', owner, ['audit:read', 'users:read_pii'], null],
    ['manager creates a subset', manager, ['events:read'], null],
    ['manager cannot create a stronger role', manager, ['audit:read'], ERROR_CODES.IAM_ESCALATION],
  ] as const)('create: %s', (_name, actor, permissions, expected) => {
    expect(
      codeOf(() => {
        assertCanCreateRole(actor, permissions);
      }),
    ).toBe(expected);
  });

  it.each([
    ['owner edits admin', owner, adminRole, ['audit:read'], null],
    ['manager edits a covered role', manager, editorRole, ['events:read'], null],
    ['owner role is never edited', owner, ownerRole, undefined, ERROR_CODES.IAM_SYSTEM_ROLE],
    ['manager edits the admin role', manager, adminRole, undefined, ERROR_CODES.IAM_SYSTEM_ROLE],
    ['manager edits a stronger role', manager, auditorRole, undefined, ERROR_CODES.IAM_ESCALATION],
    ['manager adds what it lacks', manager, editorRole, ['audit:read'], ERROR_CODES.IAM_ESCALATION],
  ] as const)('update: %s', (_name, actor, role, next, expected) => {
    expect(
      codeOf(() => {
        assertCanUpdateRole(actor, role, next);
      }),
    ).toBe(expected);
  });

  it.each([
    ['owner deletes a custom role', owner, auditorRole, null],
    ['system roles are never deleted', owner, adminRole, ERROR_CODES.IAM_SYSTEM_ROLE],
    ['manager deletes a stronger role', manager, auditorRole, ERROR_CODES.IAM_ESCALATION],
  ] as const)('delete: %s', (_name, actor, role, expected) => {
    expect(
      codeOf(() => {
        assertCanDeleteRole(actor, role);
      }),
    ).toBe(expected);
  });
});

describe('role assignment', () => {
  it.each([
    ['owner grants editor', owner, editor, editorRole, null],
    ['manager grants a covered role', manager, nobody, editorRole, null],
    ['owner role is never granted via API', owner, nobody, ownerRole, ERROR_CODES.IAM_SYSTEM_ROLE],
    ['cannot change own roles', manager, manager, editorRole, ERROR_CODES.IAM_SELF_MODIFICATION],
    ['cannot touch the owner', manager, owner, editorRole, ERROR_CODES.IAM_SYSTEM_ROLE],
    ['cannot grant what it lacks', manager, nobody, auditorRole, ERROR_CODES.IAM_ESCALATION],
    [
      'cannot manage a stronger user',
      manager,
      access('auditor', ['auditor'], ['audit:read']),
      editorRole,
      ERROR_CODES.IAM_ESCALATION,
    ],
  ] as const)('%s', (_name, actor, target, role, expected) => {
    expect(
      codeOf(() => {
        assertCanChangeAssignment(actor, target, role);
      }),
    ).toBe(expected);
  });
});
