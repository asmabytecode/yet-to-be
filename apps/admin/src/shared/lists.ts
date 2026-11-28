import { useInfiniteQuery, type QueryKey } from '@tanstack/react-query';
import type { ListResponse } from '@yet-to-be/shared';
import { useSearchParams } from 'react-router-dom';

/** Курсорна пагінація API → «Показати ще». */
export function useCursorList<T>(
  queryKey: QueryKey,
  fetchPage: (cursor: string | undefined) => Promise<ListResponse<T>>,
) {
  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => fetchPage(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  return {
    ...query,
    items: query.data?.pages.flatMap((page) => page.items) ?? [],
  };
}

/** Фільтри живуть в URL: сторінку можна оновити чи надіслати посилання без втрати стану. */
export function useUrlFilters<K extends string>(names: readonly K[]) {
  const [params, setParams] = useSearchParams();
  const values = Object.fromEntries(names.map((name) => [name, params.get(name) ?? ''])) as Record<
    K,
    string
  >;
  const set = (name: K, value: string): void => {
    const next = new URLSearchParams(params);
    if (value === '') next.delete(name);
    else next.set(name, value);
    setParams(next, { replace: true });
  };
  return { values, set };
}

const DATE_TIME = new Intl.DateTimeFormat('uk-UA', { dateStyle: 'medium', timeStyle: 'short' });

export function formatDateTime(iso: string | null | undefined): string {
  if (iso === null || iso === undefined) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : DATE_TIME.format(date);
}

/** ISO → значення для <input type="datetime-local"> у часовому поясі браузера. */
export function toLocalInput(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/** Значення datetime-local → ISO (UTC) або null, якщо порожньо/некоректно. */
export function fromLocalInput(value: string): string | null {
  if (value === '') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
