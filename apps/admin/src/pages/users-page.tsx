import { type AdminUserDto, USER_STATUSES } from '@yet-to-be/shared';
import { Badge, type Column, DataTable, Field, SelectField } from '@yet-to-be/ui';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { adminApi, keys } from '../api/admin-api';
import { formatDateTime, useCursorList, useUrlFilters } from '../shared/lists';

export function UserStatusBadge({ status }: { status: AdminUserDto['status'] }) {
  const { t } = useTranslation();
  return (
    <Badge tone={status === 'active' ? 'success' : 'danger'}>{t(`users.status.${status}`)}</Badge>
  );
}

export function UsersPage() {
  const { t } = useTranslation();
  const { values, set } = useUrlFilters(['status', 'q', 'email'] as const);
  const params = { status: values.status, q: values.q, email: values.email, limit: 25 };
  const list = useCursorList(keys.users(params), (cursor) =>
    adminApi.users.list({ ...params, cursor }),
  );

  const columns: Column<AdminUserDto>[] = [
    {
      key: 'name',
      header: t('users.columns.name'),
      cell: (row) => (
        <Link className="font-medium text-indigo-700 underline" to={`/users/${row.id}`}>
          {row.displayName}
        </Link>
      ),
    },
    {
      key: 'status',
      header: t('users.columns.status'),
      cell: (row) => <UserStatusBadge status={row.status} />,
    },
    {
      key: 'roles',
      header: t('users.columns.roles'),
      cell: (row) => (row.roles.length === 0 ? '—' : row.roles.join(', ')),
    },
    {
      key: 'lastLogin',
      header: t('users.columns.lastLogin'),
      cell: (row) =>
        row.lastLoginAt === null ? t('users.never') : formatDateTime(row.lastLoginAt),
    },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{t('users.title')}</h1>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field
          label={t('users.searchName')}
          type="search"
          maxLength={50}
          defaultValue={values.q}
          onBlur={(event) => {
            set('q', event.target.value.trim());
          }}
        />
        <Field
          label={t('users.searchEmail')}
          type="email"
          maxLength={254}
          defaultValue={values.email}
          onBlur={(event) => {
            set('email', event.target.value.trim());
          }}
        />
        <SelectField
          label={t('users.columns.status')}
          value={values.status}
          onChange={(event) => {
            set('status', event.target.value);
          }}
        >
          <option value="">{t('common.all')}</option>
          {USER_STATUSES.map((status) => (
            <option key={status} value={status}>
              {t(`users.status.${status}`)}
            </option>
          ))}
        </SelectField>
      </div>
      <DataTable
        caption={t('users.title')}
        columns={columns}
        rows={list.items}
        rowKey={(row) => row.id}
        emptyText={list.isError ? t('errors.VALIDATION_FAILED') : t('common.empty')}
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
