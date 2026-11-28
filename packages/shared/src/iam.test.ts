import { describe, expect, it } from 'vitest';
import {
  createRoleSchema,
  grantRoleSchema,
  isPermission,
  PERMISSIONS,
  updateRoleSchema,
} from './iam';

const validRole = { key: 'editor', name: 'Редактор', permissions: ['events:read'] };

describe('permission catalog', () => {
  it('has unique, namespaced keys', () => {
    expect(new Set(PERMISSIONS).size).toBe(PERMISSIONS.length);
    for (const permission of PERMISSIONS) {
      expect(permission).toMatch(/^[a-z]+:[a-z_]+$/);
    }
  });

  it('recognizes only catalog keys', () => {
    expect(isPermission('events:read')).toBe(true);
    expect(isPermission('events:*')).toBe(false);
    expect(isPermission('*')).toBe(false);
  });
});

describe('createRoleSchema', () => {
  it('accepts a valid role and defaults requiresMfa', () => {
    expect(createRoleSchema.parse(validRole)).toEqual({ ...validRole, requiresMfa: false });
  });

  it('rejects unknown permissions, wildcards, duplicates and empty lists', () => {
    for (const permissions of [['events:*'], ['*'], ['events:read', 'events:read'], []]) {
      expect(createRoleSchema.safeParse({ ...validRole, permissions }).success).toBe(false);
    }
  });

  it('rejects unknown fields (mass assignment) and unsafe text', () => {
    expect(createRoleSchema.safeParse({ ...validRole, isSystem: true }).success).toBe(false);
    expect(createRoleSchema.safeParse({ ...validRole, name: 'Ed\u202Eitor' }).success).toBe(false);
    expect(createRoleSchema.safeParse({ ...validRole, key: 'Owner' }).success).toBe(false);
  });
});

describe('updateRoleSchema', () => {
  it('requires at least one field and forbids changing the key', () => {
    expect(updateRoleSchema.safeParse({}).success).toBe(false);
    expect(updateRoleSchema.safeParse({ key: 'other' }).success).toBe(false);
    expect(updateRoleSchema.safeParse({ description: null }).success).toBe(true);
  });
});

describe('grantRoleSchema', () => {
  it('requires a valid email and role id', () => {
    expect(
      grantRoleSchema.safeParse({
        email: 'a@example.com',
        roleId: '7d1e4c62-6a3b-4c1e-9f2a-1b2c3d4e5f60',
      }).success,
    ).toBe(true);
    expect(grantRoleSchema.safeParse({ email: 'nope', roleId: 'x' }).success).toBe(false);
  });
});
