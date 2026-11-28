import { describe, expect, it } from 'vitest';
import {
  base32Decode,
  base32Encode,
  generateRecoveryCode,
  generateTotpSecret,
  hotp,
  otpauthUri,
  totp,
  verifyTotp,
} from './totp';

// RFC 6238, Appendix B (SHA1): секрет "12345678901234567890", 8 цифр.
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890', 'ascii'));

describe('TOTP (RFC 6238)', () => {
  it.each([
    [59, '94287082'],
    [1_111_111_109, '07081804'],
    [1_111_111_111, '14050471'],
    [1_234_567_890, '89005924'],
    [2_000_000_000, '69279037'],
    [20_000_000_000, '65353130'],
  ])('matches the RFC test vector at T=%d', (seconds, expected) => {
    expect(totp(RFC_SECRET, seconds * 1000, 8)).toBe(expected);
  });

  it('matches RFC 4226 HOTP vectors', () => {
    const secret = Buffer.from('12345678901234567890', 'ascii');
    expect([0, 1, 2, 9].map((counter) => hotp(secret, counter))).toEqual([
      '755224',
      '287082',
      '359152',
      '520489',
    ]);
  });

  it('round-trips base32 and rejects invalid characters', () => {
    const bytes = Buffer.from([0, 1, 2, 250, 255, 128, 64]);
    expect(base32Decode(base32Encode(bytes))).toEqual(bytes);
    expect(() => base32Decode('ABC1')).toThrow();
    expect(generateTotpSecret()).toMatch(/^[A-Z2-7]{32}$/);
  });

  it('accepts the current and adjacent steps, rejects others and replays', () => {
    const secret = generateTotpSecret();
    const now = 1_700_000_000_000;
    const code = totp(secret, now);
    const step = verifyTotp(secret, code, now, null);
    expect(step).not.toBeNull();
    expect(verifyTotp(secret, totp(secret, now - 30_000), now, null)).not.toBeNull();
    expect(verifyTotp(secret, totp(secret, now - 120_000), now, null)).toBeNull();
    // Повторне використання того самого коду.
    expect(verifyTotp(secret, code, now, step)).toBeNull();
    expect(verifyTotp(secret, '000000', now, null) === null || code === '000000').toBe(true);
  });

  it('builds an otpauth URI and recovery codes', () => {
    expect(otpauthUri('YET TO BE', 'Ada', 'ABC')).toBe(
      'otpauth://totp/YET%20TO%20BE%3AAda?secret=ABC&issuer=YET+TO+BE&algorithm=SHA1&digits=6&period=30',
    );
    expect(generateRecoveryCode()).toMatch(/^[A-Z2-7]{5}-[A-Z2-7]{5}$/);
  });
});
