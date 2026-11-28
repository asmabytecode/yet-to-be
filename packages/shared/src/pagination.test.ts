import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { listResponseSchema, PAGE_LIMIT_MAX, paginationQuerySchema } from './pagination';

describe('paginationQuerySchema', () => {
  it('applies the default limit and coerces strings from the query', () => {
    expect(paginationQuerySchema.parse({})).toEqual({ limit: 20 });
    expect(paginationQuerySchema.parse({ limit: '5', cursor: 'abc-1' })).toEqual({
      limit: 5,
      cursor: 'abc-1',
    });
  });

  it('caps the page size', () => {
    expect(paginationQuerySchema.safeParse({ limit: String(PAGE_LIMIT_MAX + 1) }).success).toBe(
      false,
    );
    expect(paginationQuerySchema.safeParse({ limit: '0' }).success).toBe(false);
    expect(paginationQuerySchema.safeParse({ limit: '2.5' }).success).toBe(false);
  });

  it('rejects unsafe cursors and unknown parameters', () => {
    expect(paginationQuerySchema.safeParse({ cursor: "1' OR '1'='1" }).success).toBe(false);
    expect(paginationQuerySchema.safeParse({ cursor: 'x'.repeat(65) }).success).toBe(false);
    expect(paginationQuerySchema.safeParse({ sort: 'password' }).success).toBe(false);
  });
});

describe('listResponseSchema', () => {
  it('describes items and the next cursor', () => {
    const schema = listResponseSchema(z.object({ id: z.string() }));
    expect(schema.parse({ items: [{ id: 'a' }], nextCursor: null })).toEqual({
      items: [{ id: 'a' }],
      nextCursor: null,
    });
  });
});
