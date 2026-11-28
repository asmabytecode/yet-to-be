import { describe, expect, it } from 'vitest';
import { sanitizeAuditMetadata } from './audit-sanitize';

describe('sanitizeAuditMetadata', () => {
  it('redacts sensitive keys and email-like values anywhere in the tree', () => {
    expect(
      sanitizeAuditMetadata({
        password: 'secret',
        refreshToken: 't',
        nested: { email: 'a@b.co', firstName: 'Ada', ok: 'value' },
        list: ['x@y.io', 'fine'],
        count: 3,
      }),
    ).toEqual({
      password: '[redacted]',
      refreshToken: '[redacted]',
      nested: { email: '[redacted]', firstName: '[redacted]', ok: 'value' },
      list: ['[redacted]', 'fine'],
      count: 3,
    });
  });

  it('limits depth, string length and array size, and drops prototype keys', () => {
    const deep = { a: { b: { c: { d: { e: 1 } } } } };
    expect(sanitizeAuditMetadata(deep)).toEqual({ a: { b: { c: { d: '[truncated]' } } } });
    const long = sanitizeAuditMetadata({ s: 'x'.repeat(600) }) as { s: string };
    expect(long.s.length).toBeLessThanOrEqual(501);
    const many = sanitizeAuditMetadata({ list: Array.from({ length: 80 }, () => 1) }) as {
      list: unknown[];
    };
    expect(many.list).toHaveLength(50);
    const polluted = JSON.parse('{"__proto__":{"admin":true},"ok":1}') as Record<string, unknown>;
    expect(sanitizeAuditMetadata(polluted)).toEqual({ ok: 1 });
  });

  it('passes null through', () => {
    expect(sanitizeAuditMetadata(null)).toBeNull();
  });
});
