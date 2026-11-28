import { describe, expect, it } from 'vitest';
import { mfaVerifySchema, recoveryCodeSchema, totpCodeSchema } from './mfa';

describe('MFA schemas', () => {
  it('accepts 6 digits and strips spaces', () => {
    expect(totpCodeSchema.parse('123 456')).toBe('123456');
    for (const bad of ['12345', '1234567', 'abcdef', '12345\u0000']) {
      expect(totpCodeSchema.safeParse(bad).success).toBe(false);
    }
  });

  it('normalizes recovery codes', () => {
    expect(recoveryCodeSchema.parse(' abcde-fgh23 ')).toBe('ABCDE-FGH23');
    expect(recoveryCodeSchema.safeParse('ABCDE-FGH18').success).toBe(false);
  });

  it('accepts exactly one of code or recoveryCode', () => {
    expect(mfaVerifySchema.safeParse({ code: '123456' }).success).toBe(true);
    expect(mfaVerifySchema.safeParse({ recoveryCode: 'ABCDE-FGHIJ' }).success).toBe(true);
    expect(mfaVerifySchema.safeParse({ code: '123456', recoveryCode: 'ABCDE-FGHIJ' }).success).toBe(
      false,
    );
    expect(mfaVerifySchema.safeParse({}).success).toBe(false);
  });
});
