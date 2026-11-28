import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, Field, FormError, Spinner, useToast } from '@yet-to-be/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { adminApi, keys } from '../api/admin-api';
import { MfaSetup } from '../features/mfa/mfa-setup';
import { errorMessage } from '../shared-errors';

export function SecurityPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const client = useQueryClient();
  const status = useQuery({ queryKey: keys.mfa, queryFn: adminApi.mfa.status });
  const [code, setCode] = useState('');
  const disable = useMutation({
    mutationFn: () => adminApi.mfa.disable(code),
    onSuccess: async () => {
      setCode('');
      toast.success(t('mfa.disabled'));
      await client.invalidateQueries({ queryKey: keys.mfa });
    },
  });

  if (status.data === undefined) return <Spinner label={t('app.loading')} />;
  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-semibold">{t('mfa.title')}</h1>
      <Card className="flex items-center gap-3">
        {status.data.enabled ? (
          <Badge tone="success">{t('mfa.statusOn')}</Badge>
        ) : (
          <Badge tone="warning">{t('mfa.statusOff')}</Badge>
        )}
        {status.data.required ? <Badge tone="info">{t('mfa.required')}</Badge> : null}
      </Card>
      {status.data.enabled ? (
        status.data.required ? null : (
          <Card>
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                disable.mutate();
              }}
            >
              <Field
                label={t('mfa.code')}
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(event) => {
                  setCode(event.target.value);
                }}
              />
              <FormError message={disable.error === null ? null : errorMessage(disable.error)} />
              <Button type="submit" variant="danger" disabled={disable.isPending || code === ''}>
                {t('mfa.disable')}
              </Button>
            </form>
          </Card>
        )
      ) : (
        <MfaSetup />
      )}
    </div>
  );
}
