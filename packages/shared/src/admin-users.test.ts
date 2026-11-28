import { describe, expect, it } from 'vitest';
import { adminUserQuerySchema, blockUserSchema } from './admin-users';
import { auditQuerySchema } from './audit';

describe('adminUserQuerySchema', () => {
  it('accepts filters and search', () => {
    expect(adminUserQuerySchema.parse({ status: 'blocked', role: 'admin', q: ' Ada ' })).toEqual({
      status: 'blocked',
      role: 'admin',
      q: 'Ada',
      limit: 20,
    });
  });

  it('rejects mixing q and email, unknown statuses and unknown params', () => {
    expect(adminUserQuerySchema.safeParse({ q: 'Ada', email: 'a@example.com' }).success).toBe(
      false,
    );
    expect(adminUserQuerySchema.safeParse({ status: 'deleted' }).success).toBe(false);
    expect(adminUserQuerySchema.safeParse({ orderBy: 'passwordHash' }).success).toBe(false);
  });
});

describe('blockUserSchema', () => {
  it('requires a meaningful reason', () => {
    expect(blockUserSchema.safeParse({ reason: 'spam' }).success).toBe(false);
    expect(blockUserSchema.safeParse({ reason: 'Spam in event comments' }).success).toBe(true);
    expect(blockUserSchema.safeParse({ reason: 'Spam in event\u202E comments' }).success).toBe(
      false,
    );
  });
});

describe('auditQuerySchema', () => {
  it('validates filters and the period', () => {
    expect(
      auditQuerySchema.safeParse({ action: 'admin.role.grant', from: '2026-01-01T00:00:00Z' })
        .success,
    ).toBe(true);
    expect(auditQuerySchema.safeParse({ action: "x' OR 1=1" }).success).toBe(false);
    expect(
      auditQuerySchema.safeParse({ from: '2026-02-01T00:00:00Z', to: '2026-01-01T00:00:00Z' })
        .success,
    ).toBe(false);
  });
});
