import type { ListResponse, PaginationQuery } from '@yet-to-be/shared';

/**
 * Аргументи курсорної пагінації Prisma. Беремо на один запис більше, щоб знати, чи є
 * наступна сторінка, не рахуючи всю таблицю.
 */
export function pageArgs(query: PaginationQuery): {
  take: number;
  cursor?: { id: string };
  skip?: number;
} {
  return query.cursor === undefined
    ? { take: query.limit + 1 }
    : { take: query.limit + 1, cursor: { id: query.cursor }, skip: 1 };
}

/** Перетворює «limit + 1» рядків на сторінку з курсором наступної. */
export function toPage<T extends { id: string }, R>(
  rows: T[],
  limit: number,
  map: (row: T) => R,
): ListResponse<R> {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items.at(-1);
  return { items: items.map(map), nextCursor: hasMore && last !== undefined ? last.id : null };
}
