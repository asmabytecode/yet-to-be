import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Field, FormError } from '@yet-to-be/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { adminApi } from '../../api/admin-api';
import { errorMessage } from '../../shared-errors';

/** Підтвердження MFA для нової сесії: код із застосунку або один резервний код. */
export function MfaVerify() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [useRecovery, setUseRecovery] = useState(false);
  const [value, setValue] = useState('');
  const verify = useMutation({
    mutationFn: () => adminApi.mfa.verify(useRecovery ? { recoveryCode: value } : { code: value }),
    onSuccess: () => client.invalidateQueries(),
  });

  return (
    <Card className="mx-auto max-w-md space-y-4">
      <h1 className="text-lg font-semibold">{t('mfa.verifyTitle')}</h1>
      <p className="text-sm text-slate-700">{t('mfa.verifyText')}</p>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          verify.mutate();
        }}
      >
        <Field
          label={useRecovery ? t('mfa.recoveryCode') : t('mfa.code')}
          autoComplete="one-time-code"
          inputMode={useRecovery ? 'text' : 'numeric'}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
          }}
        />
        <FormError message={verify.error === null ? null : errorMessage(verify.error)} />
        <div className="flex items-center justify-between">
          <Button type="submit" disabled={verify.isPending || value.trim() === ''}>
            {t('mfa.verify')}
          </Button>
          <button
            type="button"
            className="text-sm text-indigo-700 underline"
            onClick={() => {
              setUseRecovery(!useRecovery);
              setValue('');
            }}
          >
            {useRecovery ? t('mfa.useCode') : t('mfa.useRecovery')}
          </button>
        </div>
      </form>
    </Card>
  );
}
