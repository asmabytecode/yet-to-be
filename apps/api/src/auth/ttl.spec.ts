import { describe, expect, it } from 'vitest';
import { ttlToSeconds } from './ttl';

describe('ttlToSeconds', () => {
  it('converts every unit', () => {
    expect(ttlToSeconds('30s')).toBe(30);
    expect(ttlToSeconds('15m')).toBe(900);
    expect(ttlToSeconds('2h')).toBe(7200);
    expect(ttlToSeconds('7d')).toBe(604_800);
  });

  it('rejects garbage', () => {
    expect(() => ttlToSeconds('15')).toThrow('Invalid TTL');
    expect(() => ttlToSeconds('m')).toThrow('Invalid TTL');
    expect(() => ttlToSeconds('1w')).toThrow('Invalid TTL');
  });
});
