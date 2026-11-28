import { describe, expect, it } from 'vitest';
import { pageArgs, toPage } from './pagination';

describe('pageArgs', () => {
  it('asks for one extra row and skips the cursor row', () => {
    expect(pageArgs({ limit: 10 })).toEqual({ take: 11 });
    expect(pageArgs({ limit: 10, cursor: 'abc' })).toEqual({
      take: 11,
      cursor: { id: 'abc' },
      skip: 1,
    });
  });
});

describe('toPage', () => {
  const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

  it('returns the next cursor when there are more rows', () => {
    expect(toPage(rows, 2, (r) => r.id)).toEqual({ items: ['a', 'b'], nextCursor: 'b' });
  });

  it('returns null cursor on the last page', () => {
    expect(toPage(rows, 3, (r) => r.id)).toEqual({ items: ['a', 'b', 'c'], nextCursor: null });
    expect(toPage([], 3, (r: { id: string }) => r.id)).toEqual({ items: [], nextCursor: null });
  });
});
