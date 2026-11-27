import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { UserDto } from '@yet-to-be/shared';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../../shared/api/errors';
import { SESSION_KEY } from '../../shared/api/query-client';
import { Button } from '../../shared/ui/button';
import { useToast } from '../../shared/ui/toast';
import { GoogleButton } from '../auth/google-button';
import { profileApi } from './api';

export function LinkedAccounts({ user }: { user: UserDto }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const toast = useToast();
  const linked = user.providers.includes('google');
  const onlyMethod = user.providers.length === 1;

  const unlink = useMutation({
    mutationFn: profileApi.unlinkGoogle,
    onSuccess: async () => {
      toast.success(t('profile.unlinked'));
      await client.invalidateQueries({ queryKey: SESSION_KEY });
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });

  return (
    <div className="space-y-3">
      <p className="text-sm">{linked ? t('profile.googleLinked') : t('profile.googleNotLinked')}</p>
      {linked ? (
        <>
          {onlyMethod ? <p className="text-sm text-slate-600">{t('profile.unlinkNeedsPassword')}</p> : null}
          <Button
            variant="secondary"
            disabled={onlyMethod || unlink.isPending}
            onClick={() => {
              unlink.mutate();
            }}
          >
            {t('profile.unlinkGoogle')}
          </Button>
        </>
      ) : (
        <GoogleButton returnTo="/profile" label={t('profile.linkGoogle')} />
      )}
    </div>
  );
}
