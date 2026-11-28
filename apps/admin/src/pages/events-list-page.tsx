import { EVENT_SORTS, EVENT_STATUSES, type AdminEventDto } from '@yet-to-be/shared';
import { Badge, type Column, DataTable, Field, SelectField, linkButtonClass } from '@yet-to-be/ui';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { adminApi, keys } from '../api/admin-api';
import { Can } from '../app/access';
import { formatDateTime, useCursorList, useUrlFilters } from '../shared/lists';

const STATUS_TONE = {
  draft: 'neutral',
  published: 'success',
  cancelled: 'danger',
  archived: 'warning',
} as const;

export function EventStatusBadge({ status }: { status: AdminEventDto['status'] }) {
  const { t } = useTranslation();
  return <Badge tone={STATUS_TONE[status]}>{t(`events.status.${status}`)}</Badge>;
}

export function EventsListPage() {
  const { t } = useTranslation();
  const { values, set } = useUrlFilters(['status', 'q', 'sort'] as const);
  const params = { status: values.status, q: values.q, sort: values.sort, limit: 25 };
  const list = useCursorList(keys.events(params), (cursor) =>
    adminApi.events.list({ ...params, cursor }),
  );

  const columns: Column<AdminEventDto>[] = [
    {
      key: 'title',
      header: t('events.columns.title'),
      cell: (row) => (
        <Link className="font-medium text-indigo-700 underline" to={`/events/${row.id}`}>
          {row.title}
        </Link>
      ),
    },
    {
      key: 'status',
      header: t('events.columns.status'),
      cell: (row) => <EventStatusBadge status={row.status} />,
    },
    {
      key: 'startsAt',
      header: t('events.columns.startsAt'),
      cell: (row) => formatDateTime(row.startsAt),
    },
    {
      key: 'updatedAt',
      header: t('events.columns.updatedAt'),
      cell: (row) => formatDateTime(row.updatedAt),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t('events.title')}</h1>
        <Can permissions={['events:write']}>
          <Link className={linkButtonClass('primary')} to="/events/new">
            {t('events.new')}
          </Link>
        </Can>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field
          label={t('common.search')}
          type="search"
          maxLength={100}
          defaultValue={values.q}
          onBlur={(event) => {
            set('q', event.target.value.trim());
          }}
        />
        <SelectField
          label={t('events.columns.status')}
          value={values.status}
          onChange={(event) => {
            set('status', event.target.value);
          }}
        >
          <option value="">{t('common.all')}</option>
          {EVENT_STATUSES.map((status) => (
            <option key={status} value={status}>
              {t(`events.status.${status}`)}
            </option>
          ))}
        </SelectField>
        <SelectField
          label={t('events.sort.label')}
          value={values.sort}
          onChange={(event) => {
            set('sort', event.target.value);
          }}
        >
          {EVENT_SORTS.map((sort) => (
            <option key={sort} value={sort === '-createdAt' ? '' : sort}>
              {t(`events.sort.${sort}`)}
            </option>
          ))}
        </SelectField>
      </div>
      <DataTable
        caption={t('events.title')}
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
