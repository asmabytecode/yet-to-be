import { describe, expect, it } from 'vitest';
import { deriveDisplayName } from './oauth.service';

describe('deriveDisplayName', () => {
  it('uses the profile name, trimmed and limited to 50 characters', () => {
    expect(deriveDisplayName('  Ada Lovelace ', 'a@example.com')).toBe('Ada Lovelace');
    expect(deriveDisplayName('x'.repeat(80), 'a@example.com')).toHaveLength(50);
  });

  it('strips control characters', () => {
    expect(deriveDisplayName('Ada\u0000 Lovelace', 'a@example.com')).toBe('Ada Lovelace');
  });

  it('falls back to the email name, then to a constant', () => {
    expect(deriveDisplayName(null, 'ada.l@example.com')).toBe('ada.l');
    expect(deriveDisplayName('A', 'ada@example.com')).toBe('ada');
    expect(deriveDisplayName(null, 'a@example.com')).toBe('User');
  });
});
