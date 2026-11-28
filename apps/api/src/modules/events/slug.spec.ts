import { describe, expect, it } from 'vitest';
import { SLUG_MAX, slugCandidate, slugify } from './slug';

describe('slugify', () => {
  it.each([
    ['Мітап про безпеку 2027', 'mitap-pro-bezpeku-2027'],
    ['Щедрий вечір у Львові', 'shchedryi-vechir-u-lvovi'],
    ["Зустріч з'їзду", 'zustrich-zizdu'],
    ['Café & Co!', 'cafe-co'],
    ['  --Hello   World--  ', 'hello-world'],
    ['<script>alert(1)</script>', 'script-alert-1-script'],
    ['../../etc/passwd', 'etc-passwd'],
    ['🎉🎉🎉', 'event'],
    ['', 'event'],
  ])('%s → %s', (title, slug) => {
    expect(slugify(title)).toBe(slug);
  });

  it('limits the length without a trailing dash', () => {
    const slug = slugify('слово '.repeat(40));
    expect(slug.length).toBeLessThanOrEqual(SLUG_MAX);
    expect(slug.endsWith('-')).toBe(false);
  });
});

describe('slugCandidate', () => {
  it('appends a counter and keeps the limit', () => {
    expect(slugCandidate('meetup', 1)).toBe('meetup');
    expect(slugCandidate('meetup', 3)).toBe('meetup-3');
    expect(slugCandidate('a'.repeat(SLUG_MAX), 12)).toHaveLength(SLUG_MAX);
  });
});
