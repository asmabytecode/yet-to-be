import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { grantRoleSchema, type MemberDto } from '@yet-to-be/shared';
import {
  Button,
  Card,
  type Column,
  DataTable,
  Field,
  FormError,
  SelectField,
  useToast,
} from '@yet-to-be/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { adminApi, keys } from '../api/admin-api';
import { useAdminSession, useCan } from '../app/access';
import { useStepUp } from '../app/step-up';
import { errorMessage } from '../shared-errors';
import { useCursorList } from '../shared/lists';

const cancelled = (failure: unknown): boolean =>
  failure instanceof Error && failure.message === 'Step-up cancelled';

export function TeamPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const can = useCan();
  const session = useAdminSession();
  const client = useQueryClient();
  const stepUp = useStepUp();
  const roles = useQuery({ queryKey: keys.roles, queryFn: () => adminApi.roles.list() });
  const list = useCursorList(keys.members, (cursor) => adminApi.members.list(cursor));
  const [email, setEmail] = useState('');
  const [roleId, setRoleId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const refresh = (): void => {
    void client.invalidateQueries({ queryKey: keys.members });
    void client.invalidateQueries({ queryKey: keys.roles });
  };
  const grant = useMutation({
    mutationFn: (input: { email: string; roleId: string }) =>
      stepUp(() => adminApi.members.grant(input.email, input.roleId)),
    onSuccess: () => {
      setEmail('');
      setError(null);
      toast.success(t('team.granted'));
      refresh();
    },
    onError: (failure) => {
      if (!cancelled(failure)) setError(errorMessage(failure));
    },
  });
  const revoke = useMutation({
    mutationFn: (input: { userId: string; roleId: string }) =>
      stepUp(() => adminApi.members.revoke(input.userId, input.roleId)),
    onSuccess: () => {
      toast.success(t('team.revoked'));
      refresh();
    },
    onError: (failure) => {
      if (!cancelled(failure)) toast.error(errorMessage(failure));
    },
  });

  const submit = (): void => {
    const parsed = grantRoleSchema.safeParse({ email, roleId });
    if (!parsed.success) {
      setError(t('errors.VALIDATION_FAILED'));
      return;
    }
    grant.mutate(parsed.data);
  };

  const me = session.data?.user.id;
  const manage = can('roles:manage');
  const columns: Column<MemberDto>[] = [
    { key: 'name', header: t('team.columns.name'), cell: (row) => row.displayName },
    {
      key: 'roles',
      header: t('team.columns.roles'),
      cell: (row) => (
        <ul className="flex flex-wrap gap-2">
          {row.roles.map((role) => (
            <li
              key={role.id}
              className="flex items-center gap-1 rounded bg-slate-100 px-2 py-1 text-xs"
            >
              <span>{role.name}</span>
              {manage && row.userId !== me ? (
                <button
                  type="button"
                  className="text-red-700 underline"
                  aria-label={`${t('team.revoke')}: ${role.name}`}
                  disabled={revoke.isPending}
                  onClick={() => {
                    revoke.mutate({ userId: row.userId, roleId: role.id });
                  }}
                >
                  {t('team.revoke')}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{t('team.title')}</h1>
      {manage ? (
        <Card>
          <form
            className="grid gap-3 sm:grid-cols-3 sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
            noValidate
          >
            <Field
              label={t('team.email')}
              type="email"
              autoComplete="off"
              maxLength={254}
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
              }}
            />
            <SelectField
              label={t('team.role')}
              value={roleId}
              onChange={(event) => {
                setRoleId(event.target.value);
              }}
            >
              <option value="">—</option>
              {(roles.data?.items ?? []).map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </SelectField>
            <Button type="submit" disabled={grant.isPending}>
              {t('team.grant')}
            </Button>
            <p className="text-xs text-slate-600 sm:col-span-3">{t('team.grantHint')}</p>
            <div className="sm:col-span-3">
              <FormError message={error} />
            </div>
          </form>
        </Card>
      ) : null}
      <DataTable
        caption={t('team.title')}
        columns={columns}
        rows={list.items}
        rowKey={(row) => row.userId}
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
