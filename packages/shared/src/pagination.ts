import { z } from 'zod';

export const PAGE_LIMIT_DEFAULT = 20;
export const PAGE_LIMIT_MAX = 100;

/** Курсор — id останнього елемента попередньої сторінки. Лише безпечні символи. */
export const cursorSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9-]+$/);

/**
 * Пагінація для query-параметрів (значення приходять рядками). Жорсткий максимум не дає
 * вивантажити всю таблицю одним запитом.
 */
export const paginationQuerySchema = z.strictObject({
  cursor: cursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(PAGE_LIMIT_MAX).default(PAGE_LIMIT_DEFAULT),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

/** Однаковий формат усіх списків API. */
export function listResponseSchema<T extends z.ZodType>(item: T) {
  return z.object({ items: z.array(item), nextCursor: z.string().nullable() });
}

export interface ListResponse<T> {
  items: T[];
  nextCursor: string | null;
}
