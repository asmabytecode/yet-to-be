import { describe, expect, it } from 'vitest';
import { loginSchema, registerSchema, userDtoSchema } from './auth';

const valid = { email: 'ada@example.com', password: 'correct horse battery', displayName: 'Ada' };

describe('registerSchema', () => {
  it('accepts valid input and trims the display name', () => {
    const parsed = registerSchema.parse({ ...valid, displayName: '  Ada  ' });
    expect(parsed.displayName).toBe('Ada');
  });

  it('rejects short, blank and over-long passwords', () => {
    expect(registerSchema.safeParse({ ...valid, password: 'short' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...valid, password: ' '.repeat(12) }).success).toBe(false);
    expect(registerSchema.safeParse({ ...valid, password: 'x'.repeat(129) }).success).toBe(false);
  });

  it('rejects a password equal to the email', () => {
    const result = registerSchema.safeParse({
      email: 'someone@example.com',
      password: 'someone@example.com',
      displayName: 'S',
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown fields and invalid emails', () => {
    expect(registerSchema.safeParse({ ...valid, role: 'admin' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...valid, email: 'not-an-email' }).success).toBe(false);
  });

  it('rejects an empty display name', () => {
    expect(registerSchema.safeParse({ ...valid, displayName: '   ' }).success).toBe(false);
  });
});

describe('loginSchema', () => {
  it('accepts email and password only', () => {
    expect(loginSchema.safeParse({ email: valid.email, password: 'x' }).success).toBe(true);
    expect(loginSchema.safeParse({ email: valid.email, password: 'x', extra: 1 }).success).toBe(false);
  });
});

describe('userDtoSchema', () => {
  it('describes the public user shape', () => {
    const dto = {
      id: 'u1',
      email: valid.email,
      displayName: 'Ada',
      firstName: null,
      lastName: null,
      bio: null,
      avatarUrl: null,
      providers: ['password'],
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    expect(userDtoSchema.safeParse(dto).success).toBe(true);
    expect(userDtoSchema.safeParse({ ...dto, providers: ['github'] }).success).toBe(false);
  });
});
