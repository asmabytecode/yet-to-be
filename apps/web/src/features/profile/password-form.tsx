import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { changePasswordSchema, setPasswordSchema } from '@yet-to-be/shared';
import { useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { applyServerError } from '../../shared/api/errors';
import { SESSION_KEY, SESSIONS_KEY } from '../../shared/api/query-client';
import { Button } from '../../shared/ui/button';
import { Field, FormError } from '../../shared/ui/field';
import { useToast } from '../../shared/ui/toast';
import { profileApi } from './api';

interface Values {
  currentPassword: string;
  newPassword: string;
}

/** Зміна пароля (якщо він є) або встановлення (акаунт, створений через Google). */
export function PasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const toast = useToast();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<Values>({
    // Для "встановити" поля currentPassword немає — окрема схема без нього.
    resolver: zodResolver(hasPassword ? changePasswordSchema : setPasswordSchema) as unknown as Resolver<Values>,
    defaultValues: { currentPassword: '', newPassword: '' },
  });

  const save = useMutation({
    mutationFn: (values: Values) =>
      hasPassword
        ? profileApi.changePassword(values)
        : profileApi.setPassword({ newPassword: values.newPassword }),
    onSuccess: async () => {
      reset();
      toast.success(hasPassword ? t('profile.passwordChanged') : t('profile.passwordSet'));
      await Promise.all([
        client.invalidateQueries({ queryKey: SESSION_KEY }),
        client.invalidateQueries({ queryKey: SESSIONS_KEY }),
      ]);
    },
    onError: (error) => {
      setFormError(
        applyServerError(error, setError, ['currentPassword', 'newPassword'], {
          AUTH_INVALID_CREDENTIALS: 'currentPassword',
          AUTH_WEAK_PASSWORD: 'newPassword',
        }),
      );
    },
  });

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(event) => {
        setFormError(null);
        void handleSubmit((values) => {
          save.mutate(values);
        })(event);
      }}
    >
      {hasPassword ? null : <p className="text-sm text-slate-600">{t('profile.setPasswordHint')}</p>}
      <FormError message={formError} />
      {hasPassword ? (
        <Field
          label={t('profile.currentPassword')}
          type="password"
          autoComplete="current-password"
          error={errors.currentPassword}
          {...register('currentPassword')}
        />
      ) : null}
      <Field
        label={t('profile.newPassword')}
        type="password"
        autoComplete="new-password"
        error={errors.newPassword}
        {...register('newPassword')}
      />
      <Button type="submit" disabled={save.isPending}>
        {hasPassword ? t('profile.changePassword') : t('profile.setPassword')}
      </Button>
    </form>
  );
}
