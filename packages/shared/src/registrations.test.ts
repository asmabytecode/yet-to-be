import { describe, expect, it } from 'vitest';
import {
  adminRegistrationDtoSchema,
  publicEventBlockSchema,
  publicEventQuerySchema,
  registrationQuerySchema,
} from './registrations';

describe('registration schemas', () => {
  it('describes an admin registration row', () => {
    const row = {
      id: 'r',
      userId: 'u',
      displayName: 'Оля',
      status: 'cancelled',
      createdAt: '2026-01-01T00:00:00.000Z',
      cancelledAt: '2026-01-02T00:00:00.000Z',
      cancelReason: 'admin',
    };
    expect(adminRegistrationDtoSchema.parse(row)).toEqual(row);
    expect(adminRegistrationDtoSchema.safeParse({ ...row, status: 'waitlist' }).success).toBe(
      false,
    );
  });

  it('accepts only known query parameters', () => {
    expect(registrationQuerySchema.parse({ status: 'registered' })).toEqual({
      status: 'registered',
      limit: 20,
    });
    expect(publicEventQuerySchema.parse({ tag: 'music' })).toEqual({ tag: 'music', limit: 20 });
    expect(publicEventQuerySchema.safeParse({ status: 'draft' }).success).toBe(false);
    expect(publicEventQuerySchema.safeParse({ tag: 'Не тег' }).success).toBe(false);
  });

  it('describes public blocks without asset ids', () => {
    expect(
      publicEventBlockSchema.parse({
        type: 'speaker',
        name: 'Ім’я',
        role: null,
        bio: null,
        photo: { thumb: '/media/a/thumb.webp', width: 10, height: 10 },
      }),
    ).toMatchObject({ type: 'speaker' });
    expect(publicEventBlockSchema.safeParse({ type: 'html', body: '<b>' }).success).toBe(false);
  });
});
