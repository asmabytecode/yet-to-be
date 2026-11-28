import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type AdminUserDetailDto, blockUserSchema } from '@yet-to-be/shared';
import { Button, Card, Dialog, FormError, Spinner, TextAreaField, useToast } from '@yet-to-be/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { adminApi, keys } from '../api/admin-api';
import { Can } from '../app/access';
import { useStepUp } from '../app/step-up';
import { errorMessage } from '../shared-errors';
import { formatDateTime } from '../shared/lists';
import { UserStatusBadge } from './users-page';

const cancelled = (failure: unknown): boolean =>
  failure instanceof Error && failure.message === 'Step-up cancelled';

export function UserDetailPage() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const query = useQuery({ queryKey: keys.user(id), queryFn: () => adminApi.users.get(id) });
  if (query.isPending) return <Spinner label={t('app.loading')} />;
  if (query.isError) {
    return (
      <Card>
        <p role="alert">{errorMessage(query.error)}</p>
      </Card>
    );
  }
  return <UserDetail user={query.data} />;
}

function UserDetail({ user }: { user: AdminUserDetailDto }) {
  const { t } = useTranslation();
  const toast = useToast();
  const client = useQueryClient();
  const stepUp = useStepUp();
  const [dialog, setDialog] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const refresh = (): void => {
    void client.invalidateQueries({ queryKey: keys.user(user.id) });
    void client.invalidateQueries({ queryKey: ['users'] });
  };
  const block = useMutation({
    mutationFn: (text: string) => stepUp(() => adminApi.users.block(user.id, text)),
    onSuccess: () => {
      setDialog(false);
      setReason('');
      toast.success(t('users.blocked'));
      refresh();
    },
    onError: (failure) => {
      if (!cancelled(failure)) setError(errorMessage(failure));
    },
  });
  const unblock = useMutation({
    mutationFn: () => stepUp(() => adminApi.users.unblock(user.id)),
    onSuccess: () => {
      toast.success(t('users.unblocked'));
      refresh();
    },
    onError: (failure) => {
      if (!cancelled(failure)) toast.error(errorMessage(failure));
    },
  });

  const submit = (): void => {
    const parsed = blockUserSchema.safeParse({ reason });
    if (!parsed.success) {
      setError(t('users.reason'));
      return;
    }
    setError(null);
    block.mutate(parsed.data.reason);
  };

  const rows: [string, string][] = [
    [t('users.email'), user.email ?? t('users.emailHidden')],
    [t('users.columns.roles'), user.roles.length === 0 ? '—' : user.roles.join(', ')],
    [t('users.mfa'), user.mfaEnabled ? t('mfa.statusOn') : t('mfa.statusOff')],
    [
      t('users.columns.lastLogin'),
      user.lastLoginAt === null ? t('users.never') : formatDateTime(user.lastLoginAt),
    ],
  ];
  if (user.status === 'blocked') {
    rows.push([t('users.blockReason'), user.blockReason ?? '—']);
  }

  return (
    <div className="space-y-4">
      <Link className="text-sm text-indigo-700 underline" to="/users">
        {t('common.back')}
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-3 text-2xl font-semibold">
          {user.displayName} <UserStatusBadge status={user.status} />
        </h1>
        <Can permissions={['users:block']}>
          {user.status === 'active' ? (
            <Button
              variant="danger"
              onClick={() => {
                setDialog(true);
              }}
            >
              {t('users.block')}
            </Button>
          ) : (
            <Button
              variant="secondary"
              disabled={unblock.isPending}
              onClick={() => {
                unblock.mutate();
              }}
            >
              {t('users.unblock')}
            </Button>
          )}
        </Can>
      </div>
      <Card>
        <dl className="grid gap-3 sm:grid-cols-2">
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs font-medium text-slate-500">{label}</dt>
              <dd className="text-sm text-slate-900">{value}</dd>
            </div>
          ))}
        </dl>
      </Card>
      <Dialog
        open={dialog}
        title={t('users.block')}
        onClose={() => {
          setDialog(false);
        }}
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setDialog(false);
              }}
            >
              {t('common.cancel')}
            </Button>
            <Button variant="danger" disabled={block.isPending} onClick={submit}>
              {t('users.block')}
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-700">{t('users.blockText')}</p>
        <TextAreaField
          label={t('users.reason')}
          rows={3}
          maxLength={500}
          value={reason}
          onChange={(event) => {
            setReason(event.target.value);
          }}
        />
        <FormError message={error} />
      </Dialog>
    </div>
  );
}
