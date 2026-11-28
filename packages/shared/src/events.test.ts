import { describe, expect, it } from 'vitest';
import {
  createEventSchema,
  EVENT_ACTIONS,
  EVENT_STATUSES,
  eventBlockSchema,
  eventQuerySchema,
  httpsUrlSchema,
  nextStatus,
  replaceBlocksSchema,
  updateEventSchema,
} from './events';

const valid = {
  title: 'Мітап про безпеку',
  startsAt: '2027-03-01T18:00:00+01:00',
  endsAt: '2027-03-01T21:00:00+01:00',
  timezone: 'Europe/Warsaw',
};

describe('event state machine', () => {
  it.each([
    ['draft', 'publish', 'published'],
    ['published', 'unpublish', 'draft'],
    ['published', 'cancel', 'cancelled'],
    ['cancelled', 'archive', 'archived'],
    ['draft', 'archive', 'archived'],
  ] as const)('%s --%s--> %s', (from, action, to) => {
    expect(nextStatus(from, action)).toBe(to);
  });

  it('refuses every other transition (archived is final)', () => {
    const allowed = new Set([
      'draft:publish',
      'published:unpublish',
      'published:cancel',
      'draft:archive',
      'published:archive',
      'cancelled:archive',
    ]);
    for (const status of EVENT_STATUSES) {
      for (const action of EVENT_ACTIONS) {
        expect(nextStatus(status, action) !== null).toBe(allowed.has(`${status}:${action}`));
      }
    }
  });
});

describe('createEventSchema', () => {
  it('fills defaults', () => {
    expect(createEventSchema.parse(valid)).toMatchObject({
      ...valid,
      tags: [],
      capacity: null,
      onlineUrl: null,
    });
  });

  it('requires the end after the start and a real time zone', () => {
    expect(createEventSchema.safeParse({ ...valid, endsAt: valid.startsAt }).success).toBe(false);
    expect(createEventSchema.safeParse({ ...valid, timezone: 'Mars/Olympus' }).success).toBe(false);
    expect(createEventSchema.safeParse({ ...valid, startsAt: 'tomorrow' }).success).toBe(false);
  });

  it('rejects mass assignment of server-controlled fields', () => {
    for (const field of ['status', 'slug', 'version', 'createdById', 'publishedAt']) {
      expect(createEventSchema.safeParse({ ...valid, [field]: 'x' }).success).toBe(false);
    }
  });
});

describe('httpsUrlSchema', () => {
  it.each([
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'http://example.com',
    'https://user:pass@example.com',
    `https://example.com/${'a'.repeat(2050)}`,
  ])('rejects %s', (value) => {
    expect(httpsUrlSchema.safeParse(value).success).toBe(false);
  });

  it('accepts https links', () => {
    expect(httpsUrlSchema.parse(' https://meet.example.com/abc ')).toBe(
      'https://meet.example.com/abc',
    );
  });
});

describe('updateEventSchema', () => {
  it('requires a version and at least one field', () => {
    expect(updateEventSchema.safeParse({ title: 'Новий заголовок' }).success).toBe(false);
    expect(updateEventSchema.safeParse({ version: 1 }).success).toBe(false);
    expect(updateEventSchema.safeParse({ version: 1, title: 'Новий заголовок' }).success).toBe(
      true,
    );
  });
});

describe('event blocks', () => {
  it('validates each block type strictly', () => {
    expect(eventBlockSchema.safeParse({ type: 'text', data: { body: 'Привіт' } }).success).toBe(
      true,
    );
    expect(
      eventBlockSchema.safeParse({ type: 'agenda_item', data: { time: '25:00', title: 'x' } })
        .success,
    ).toBe(false);
    expect(
      eventBlockSchema.safeParse({ type: 'link', data: { label: 'x', url: 'javascript:alert(1)' } })
        .success,
    ).toBe(false);
    expect(
      eventBlockSchema.safeParse({ type: 'speaker', data: { name: 'Ada', admin: true } }).success,
    ).toBe(false);
    expect(eventBlockSchema.safeParse({ type: 'html', data: { raw: '<script>' } }).success).toBe(
      false,
    );
  });

  it('rejects prototype-polluting keys inside block data', () => {
    const polluted = JSON.parse(
      '{"type":"text","data":{"body":"x","__proto__":{"admin":true}}}',
    ) as unknown;
    expect(eventBlockSchema.safeParse(polluted).success).toBe(false);
  });

  it('limits the number of blocks', () => {
    const block = { type: 'text', data: { body: 'x' } };
    expect(
      replaceBlocksSchema.safeParse({ version: 1, blocks: Array(51).fill(block) }).success,
    ).toBe(false);
  });
});

describe('eventQuerySchema', () => {
  it('only allows known sort orders', () => {
    expect(eventQuerySchema.parse({}).sort).toBe('-createdAt');
    expect(eventQuerySchema.safeParse({ sort: 'passwordHash' }).success).toBe(false);
  });
});
