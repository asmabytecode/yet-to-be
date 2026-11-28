import type { ReactNode } from 'react';
import { Button } from './button';

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  caption: string;
  columns: readonly Column<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string;
  emptyText: string;
  /** Курсорна пагінація: «Показати ще», якщо сервер повернув nextCursor. */
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  loadMoreLabel?: string;
}

/**
 * Універсальна таблиця адмінки. Серверна пагінація, фільтри й сортування живуть у сторінці
 * (стан в URL), таблиця лише показує. caption — для читачів екрана.
 */
export function DataTable<T>({
  caption,
  columns,
  rows,
  rowKey,
  emptyText,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
  loadMoreLabel = 'Показати ще',
}: DataTableProps<T>) {
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg bg-white ring-1 ring-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="bg-slate-50">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className="px-4 py-2 text-left font-medium text-slate-700"
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-6 text-center text-slate-500">
                  {emptyText}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={rowKey(row)}>
                  {columns.map((column) => (
                    <td key={column.key} className={column.className ?? 'px-4 py-2 align-top'}>
                      {column.cell(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {hasMore && onLoadMore !== undefined ? (
        <Button variant="secondary" disabled={loadingMore} onClick={onLoadMore}>
          {loadMoreLabel}
        </Button>
      ) : null}
    </div>
  );
}
