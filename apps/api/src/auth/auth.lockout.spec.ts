import { describe, expect, it } from 'vitest';
import { lockDurationMs } from './auth.service';

describe('lockDurationMs', () => {
  it('starts at 15 minutes and doubles per five failures', () => {
    expect(lockDurationMs(5)).toBe(15 * 60_000);
    expect(lockDurationMs(10)).toBe(30 * 60_000);
    expect(lockDurationMs(15)).toBe(60 * 60_000);
  });

  it('is capped at 24 hours', () => {
    expect(lockDurationMs(500)).toBe(24 * 3_600_000);
  });
});
