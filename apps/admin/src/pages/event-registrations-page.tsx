import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminRegistrationDto } from '@yet-to-be/shared';
import { Badge, Button, type Column, ConfirmDialog, DataTable, useToast } from '@yet-to-be/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { adminApi, keys } from '../api/admin-api';
import { useCan } from '../app/access';
import { errorMessage } from '../shared-errors';
import { formatDateTime, useCursorList } from '../shared/lists';

export function EventRegistrationsPage() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const toast = useToast();
  const can = useCan();
  const client = useQueryClient();
  const [target, setTarget] = useState<AdminRegistrationDto | null>(null);
  const event = useQuery({ queryKey: keys.event(id), queryFn: () => adminApi.events.get(id) });
  const list = useCursorList(keys.registrations(id), (cursor) =>
    adminApi.events.registrations(id, cursor),
  );
  const cancel = useMutation({
    mutationFn: (registrationId: string) => adminApi.events.cancelRegistration(id, registrationId),
    onSuccess: () => {
      setTarget(null);
      toast.success(t('registrations.cancelled'));
      void client.invalidateQueries({ queryKey: keys.registrations(id) });
    },
    onError: (failure) => {
      setTarget(null);
      toast.error(errorMessage(failure));
    },
  });

  const active = list.items.filter((row) => row.status === 'registered').length;
  const columns: Column<AdminRegistrationDto>[] = [
    { key: 'name', header: t('users.columns.name'), cell: (row) => row.displayName },
    {
      key: 'status',
      header: t('events.columns.status'),
      cell: (row) => (
        <Badge tone={row.status === 'registered' ? 'success' : 'neutral'}>
          {t(`registrations.status.${row.status}`)}
        </Badge>
      ),
    },
    {
      key: 'createdAt',
      header: t('registrations.createdAt'),
      cell: (row) => formatDateTime(row.createdAt),
    },
    {
      key: 'actions',
      header: t('common.actions'),
      cell: (row) =>
        row.status === 'registered' && can('registrations:manage') ? (
          <Button
            variant="secondary"
            onClick={() => {
              setTarget(row);
            }}
          >
            {t('registrations.cancel')}
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-4">
      <Link className="text-sm text-indigo-700 underline" to={`/events/${id}`}>
        {t('common.back')}
      </Link>
      <h1 className="text-2xl font-semibold">
        {t('registrations.title')}
        {event.data === undefined ? '' : ` · ${event.data.title}`}
      </h1>
      <p className="text-sm text-slate-700">
        {t('registrations.count', { count: active })}
        {event.data?.capacity === null || event.data?.capacity === undefined
          ? ''
          : ` · ${t('registrations.capacity', { capacity: event.data.capacity })}`}
      </p>
      <DataTable
        caption={t('registrations.title')}
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
      <ConfirmDialog
        open={target !== null}
        title={t('registrations.cancel')}
        description={t('registrations.cancelText', { name: target?.displayName ?? '' })}
        confirmLabel={t('registrations.cancel')}
        cancelLabel={t('common.cancel')}
        pending={cancel.isPending}
        onCancel={() => {
          setTarget(null);
        }}
        onConfirm={() => {
          if (target !== null) cancel.mutate(target.id);
        }}
      />
    </div>
  );
}
