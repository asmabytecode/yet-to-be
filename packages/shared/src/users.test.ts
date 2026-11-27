import { describe, expect, it } from 'vitest';
import {
  changePasswordSchema,
  safeReturnTo,
  setPasswordSchema,
  updateProfileSchema,
} from './users';

describe('updateProfileSchema', () => {
  it('accepts allowed fields and trims them', () => {
    expect(updateProfileSchema.parse({ displayName: '  Ada  ', bio: 'line1\nline2' })).toEqual({
      displayName: 'Ada',
      bio: 'line1\nline2',
    });
  });

  it('rejects unknown fields (mass assignment)', () => {
    for (const field of ['email', 'passwordHash', 'id', 'status']) {
      expect(updateProfileSchema.safeParse({ displayName: 'Ada', [field]: 'x' }).success).toBe(
        false,
      );
    }
  });

  it('rejects empty bodies, short names, long values and control characters', () => {
    expect(updateProfileSchema.safeParse({}).success).toBe(false);
    expect(updateProfileSchema.safeParse({ displayName: 'A' }).success).toBe(false);
    expect(updateProfileSchema.safeParse({ firstName: 'x'.repeat(51) }).success).toBe(false);
    expect(updateProfileSchema.safeParse({ bio: 'x'.repeat(501) }).success).toBe(false);
    expect(updateProfileSchema.safeParse({ firstName: 'Ada\u0000' }).success).toBe(false);
    expect(updateProfileSchema.safeParse({ bio: 'bell\u0007' }).success).toBe(false);
  });

  it('allows an empty string to clear optional fields', () => {
    expect(updateProfileSchema.parse({ bio: '' })).toEqual({ bio: '' });
  });
});

describe('password schemas', () => {
  it('requires a different new password', () => {
    const same = 'correct horse battery';
    expect(
      changePasswordSchema.safeParse({ currentPassword: same, newPassword: same }).success,
    ).toBe(false);
    expect(
      changePasswordSchema.safeParse({
        currentPassword: same,
        newPassword: 'another long password',
      }).success,
    ).toBe(true);
  });

  it('enforces the password policy on new passwords', () => {
    expect(setPasswordSchema.safeParse({ newPassword: 'short' }).success).toBe(false);
    expect(setPasswordSchema.safeParse({ newPassword: 'long enough password', x: 1 }).success).toBe(
      false,
    );
  });
});

describe('safeReturnTo', () => {
  it('keeps allowlisted relative paths and drops the query', () => {
    expect(safeReturnTo('/profile')).toBe('/profile');
    expect(safeReturnTo('/profile?tab=sessions')).toBe('/profile');
  });

  it.each([
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    'profile',
    '/unknown',
    '',
    undefined,
    42,
  ])('falls back to "/" for %s', (value) => {
    expect(safeReturnTo(value)).toBe('/');
  });
});
