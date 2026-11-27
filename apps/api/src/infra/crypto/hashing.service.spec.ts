import { describe, expect, it } from 'vitest';
import { createTestConfig } from '../../../test/config';
import { HashingService } from './hashing.service';

describe('HashingService', () => {
  const service = new HashingService(createTestConfig());

  it('blind index is deterministic and ignores case, spaces and Unicode form', () => {
    const a = service.blindIndex('Ada@Example.com');
    expect(service.blindIndex('  ada@example.com ')).toBe(a);
    expect(service.blindIndex('ADA@EXAMPLE.COM')).toBe(a);
    // "é" як один символ і як "e" + комбінований акцент
    expect(service.blindIndex('josé@example.com')).toBe(service.blindIndex('josé@example.com'));
  });

  it('blind index differs per value and per key', () => {
    expect(service.blindIndex('a@example.com')).not.toBe(service.blindIndex('b@example.com'));
    const other = new HashingService(createTestConfig());
    expect(other.blindIndex('a@example.com')).not.toBe(service.blindIndex('a@example.com'));
  });

  it('does not reveal the input in the hash', () => {
    expect(service.blindIndex('ada@example.com')).not.toContain('ada');
  });

  it('separates domains: an email blind index never equals an IP hash of the same text', () => {
    expect(service.ipHash('127.0.0.1')).not.toBe(service.blindIndex('127.0.0.1'));
    expect(service.ipHash('127.0.0.1')).toBe(service.ipHash(' 127.0.0.1 '));
  });

  it('sha256 is a stable 64-char hex digest', () => {
    expect(service.sha256('token')).toMatch(/^[0-9a-f]{64}$/);
    expect(service.sha256('token')).toBe(service.sha256('token'));
    expect(service.sha256('token')).not.toBe(service.sha256('token2'));
  });

  it('random tokens are unique base64url strings of the requested size', () => {
    const a = service.randomToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(service.randomToken()).not.toBe(a);
    expect(service.randomToken(16)).toHaveLength(22);
  });

  it('safeEqual compares values, including different lengths', () => {
    expect(service.safeEqual('abc', 'abc')).toBe(true);
    expect(service.safeEqual('abc', 'abd')).toBe(false);
    expect(service.safeEqual('abc', 'abcd')).toBe(false);
  });
});
