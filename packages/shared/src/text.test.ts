import { describe, expect, it } from 'vitest';
import { isSafeText, keySchema, safeText } from './text';

describe('safeText', () => {
  const title = safeText({ min: 2, max: 10 });

  it('trims and normalizes to NFC before checking the length', () => {
    // "e" + комбінований акут (2 code units) → "é" (1 code unit) після NFC.
    expect(title.parse('  Cafe\u0301  ')).toBe('Café');
  });

  it('enforces min and max after normalization', () => {
    expect(title.safeParse(' a ').success).toBe(false);
    expect(title.safeParse('x'.repeat(11)).success).toBe(false);
    expect(title.safeParse('x'.repeat(10)).success).toBe(true);
  });

  it.each([
    ['null byte', 'ab\u0000c'],
    ['escape', 'ab\u001bc'],
    ['newline in single-line text', 'ab\ncd'],
    ['right-to-left override (Trojan Source)', 'ab\u202Ecd'],
    ['isolate', 'ab\u2066cd'],
    ['zero-width space', 'ab\u200Bcd'],
    ['zero-width joiner', 'ab\u200Dcd'],
    ['BOM', 'ab\uFEFFcd'],
  ])('rejects %s', (_name, value) => {
    expect(title.safeParse(value).success).toBe(false);
  });

  it('allows line breaks only in multiline text', () => {
    const body = safeText({ max: 100, multiline: true });
    expect(body.parse('line 1\r\nline 2')).toBe('line 1\r\nline 2');
    expect(body.safeParse('line\u0000').success).toBe(false);
    expect(body.safeParse('line\u202E').success).toBe(false);
  });

  it('rejects huge inputs before normalizing them', () => {
    expect(title.safeParse('x'.repeat(1000)).success).toBe(false);
  });

  it('isSafeText mirrors the schema checks', () => {
    expect(isSafeText('Звичайний текст')).toBe(true);
    expect(isSafeText('a\u200Bb')).toBe(false);
  });
});

describe('keySchema', () => {
  it.each(['editor', 'support_team', 'ops-2'])('accepts %s', (value) => {
    expect(keySchema.safeParse(value).success).toBe(true);
  });

  it.each(['A', 'Editor', '1role', 'role name', 'роль', 'x'.repeat(41), '__proto__'])(
    'rejects %s',
    (value) => {
      expect(keySchema.safeParse(value).success).toBe(false);
    },
  );
});
