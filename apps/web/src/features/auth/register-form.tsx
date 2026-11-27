import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { registerSchema, type RegisterInput } from '@yet-to-be/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { applyServerError } from '../../shared/api/errors';
import { SESSION_KEY } from '../../shared/api/query-client';
import { Button } from '../../shared/ui/button';
import { Field, FormError } from '../../shared/ui/field';
import { authApi } from './api';
import { GoogleButton } from './google-button';

export function RegisterForm() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: '', password: '', displayName: '' },
  });

  const signUp = useMutation({
    mutationFn: (input: RegisterInput) => authApi.register(input),
    onSuccess: (user) => {
      client.setQueryData(SESSION_KEY, user);
      void navigate('/', { replace: true });
    },
    onError: (error) => {
      setFormError(
        applyServerError(error, setError, ['email', 'password', 'displayName'], {
          AUTH_EMAIL_TAKEN: 'email',
          AUTH_WEAK_PASSWORD: 'password',
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
          signUp.mutate(values);
        })(event);
      }}
    >
      <FormError message={formError} />
      <Field
        label={t('auth.displayName')}
        autoComplete="nickname"
        error={errors.displayName}
        {...register('displayName')}
      />
      <Field
        label={t('auth.email')}
        type="email"
        autoComplete="email"
        error={errors.email}
        {...register('email')}
      />
      <Field
        label={t('auth.password')}
        type="password"
        autoComplete="new-password"
        error={errors.password}
        {...register('password')}
      />
      <Button type="submit" className="w-full" disabled={signUp.isPending}>
        {signUp.isPending ? t('auth.signingUp') : t('auth.signUp')}
      </Button>
      <p className="text-center text-sm text-slate-500">{t('auth.or')}</p>
      <GoogleButton />
      <p className="text-center text-sm">
        {t('auth.haveAccount')}{' '}
        <Link to="/login" className="font-medium text-indigo-700 underline">
          {t('auth.toLogin')}
        </Link>
      </p>
    </form>
  );
}
