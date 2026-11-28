import type { AuditEntryDto } from '@yet-to-be/shared';
import { type Column, DataTable, Field } from '@yet-to-be/ui';
import { useTranslation } from 'react-i18next';
import { adminApi, keys } from '../api/admin-api';
import { errorMessage } from '../shared-errors';
import {
  formatDateTime,
  fromLocalInput,
  toLocalInput,
  useCursorList,
  useUrlFilters,
} from '../shared/lists';

/** Метадані показуємо стисло й лише як текст (React екранує; сирого HTML немає). */
function details(metadata: AuditEntryDto['metadata']): string {
  if (metadata === null) return '—';
  const text = JSON.stringify(metadata);
  return text.length > 160 ? `${text.slice(0, 157)}…` : text;
}

export function AuditPage() {
  const { t } = useTranslation();
  const { values, set } = useUrlFilters([
    'action',
    'actorId',
    'targetType',
    'targetId',
    'from',
    'to',
  ] as const);
  const params = { ...values, limit: 50 };
  const list = useCursorList(keys.audit(params), (cursor) =>
    adminApi.audit.list({ ...params, cursor }),
  );

  const columns: Column<AuditEntryDto>[] = [
    { key: 'time', header: t('audit.columns.time'), cell: (row) => formatDateTime(row.createdAt) },
    {
      key: 'actor',
      header: t('audit.columns.actor'),
      cell: (row) => row.actorName ?? t('audit.system'),
    },
    {
      key: 'action',
      header: t('audit.columns.action'),
      cell: (row) => <code className="text-xs">{row.action}</code>,
    },
    {
      key: 'target',
      header: t('audit.columns.target'),
      cell: (row) =>
        row.targetType === null ? '—' : `${row.targetType}:${(row.targetId ?? '').slice(0, 8)}`,
    },
    {
      key: 'details',
      header: t('audit.columns.details'),
      cell: (row) => <span className="break-all font-mono text-xs">{details(row.metadata)}</span>,
    },
  ];

  const text = (name: 'action' | 'actorId' | 'targetType' | 'targetId', label: string) => (
    <Field
      label={label}
      maxLength={64}
      defaultValue={values[name]}
      onBlur={(event) => {
        set(name, event.target.value.trim());
      }}
    />
  );
  const date = (name: 'from' | 'to', label: string) => (
    <Field
      label={label}
      type="datetime-local"
      defaultValue={values[name] === '' ? '' : toLocalInput(values[name])}
      onBlur={(event) => {
        set(name, fromLocalInput(event.target.value) ?? '');
      }}
    />
  );

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{t('audit.title')}</h1>
      <div className="grid gap-3 sm:grid-cols-3">
        {text('action', t('audit.action'))}
        {text('actorId', t('audit.actorId'))}
        {text('targetType', t('audit.targetType'))}
        {text('targetId', t('audit.targetId'))}
        {date('from', t('audit.from'))}
        {date('to', t('audit.to'))}
      </div>
      {list.isError ? (
        <p role="alert" className="text-sm text-red-800">
          {errorMessage(list.error)}
        </p>
      ) : null}
      <DataTable
        caption={t('audit.title')}
        columns={columns}
        rows={list.items}
        rowKey={(row) => row.id}
        emptyText={t('common.empty')}
        hasMore={list.hasNextPage}
        loadingMore={list.isFetchingNextPage}
        onLoadMore={() => {
          void list.fetchNextPage();
        }}
        loadMoreLabel={t('common.loadMore')}
      />
    </div>
  );
}
