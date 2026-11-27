import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../../shared/api/errors';
import { SESSIONS_KEY } from '../../shared/api/query-client';
import { Button } from '../../shared/ui/button';
import { Spinner } from '../../shared/ui/card';
import { useToast } from '../../shared/ui/toast';
import { authApi } from '../auth/api';
import { useEndSession } from '../auth/use-session';
import { profileApi } from './api';

export function SessionsList() {
  const { t, i18n } = useTranslation();
  const client = useQueryClient();
  const toast = useToast();
  const endSession = useEndSession();
  const sessions = useQuery({ queryKey: SESSIONS_KEY, queryFn: profileApi.sessions });

  const revoke = useMutation({
    mutationFn: profileApi.revokeSession,
    onSuccess: async () => {
      toast.success(t('profile.revoked'));
      await client.invalidateQueries({ queryKey: SESSIONS_KEY });
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });

  const logoutAll = useMutation({
    mutationFn: authApi.logoutAll,
    onSuccess: endSession,
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });

  if (sessions.isPending) return <Spinner label={t('app.loading')} />;
  if (sessions.isError) return <p role="alert">{errorMessage(sessions.error)}</p>;

  return (
    <div className="space-y-4">
      <ul className="divide-y divide-slate-200">
        {sessions.data.map((session) => (
          <li key={session.id} className="flex items-center justify-between gap-4 py-3">
            <div className="min-w-0 text-sm">
              {/* userAgent — недовірений рядок із запиту; React екранує його як текст */}
              <p className="truncate font-medium">
                {session.userAgent ?? t('profile.unknownDevice')}
              </p>
              <p className="text-slate-600">
                {t('profile.startedAt')}:{' '}
                {new Date(session.lastUsedAt).toLocaleString(i18n.language)}
                {session.isCurrent ? ` · ${t('profile.current')}` : ''}
              </p>
            </div>
            {session.isCurrent ? null : (
              <Button
                variant="secondary"
                disabled={revoke.isPending}
                onClick={() => {
                  revoke.mutate(session.id);
                }}
              >
                {t('profile.revoke')}
              </Button>
            )}
          </li>
        ))}
      </ul>
      <Button
        variant="danger"
        disabled={logoutAll.isPending}
        onClick={() => {
          logoutAll.mutate();
        }}
      >
        {t('profile.logoutAll')}
      </Button>
    </div>
  );
}
