import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { loginSchema, safeReturnTo, type LoginInput } from '@yet-to-be/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { applyServerError } from '../../shared/api/errors';
import { SESSION_KEY } from '../../shared/api/query-client';
import { Button } from '../../shared/ui/button';
import { Field, FormError } from '../../shared/ui/field';
import { authApi } from './api';
import { GoogleButton } from './google-button';

export function LoginForm() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const [formError, setFormError] = useState<string | null>(() => {
    const code = params.get('error');
    if (code === 'oauth_failed') return t('auth.oauthFailed');
    if (code === 'account_blocked') return t('errors.ACCOUNT_BLOCKED');
    return null;
  });

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const login = useMutation({
    mutationFn: (input: LoginInput) => authApi.login(input),
    onSuccess: (user) => {
      client.setQueryData(SESSION_KEY, user);
      const from = (location.state as { from?: string } | null)?.from;
      void navigate(safeReturnTo(from), { replace: true });
    },
    onError: (error) => {
      setFormError(applyServerError(error, setError, ['email', 'password'], {}));
    },
  });

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(event) => {
        setFormError(null);
        void handleSubmit((values) => {
          login.mutate(values);
        })(event);
      }}
    >
      <FormError message={formError} />
      <Field
        label={t('auth.email')}
        type="email"
        autoComplete="username"
        error={errors.email}
        {...register('email')}
      />
      <Field
        label={t('auth.password')}
        type="password"
        autoComplete="current-password"
        error={errors.password}
        {...register('password')}
      />
      <Button type="submit" className="w-full" disabled={login.isPending}>
        {login.isPending ? t('auth.signingIn') : t('auth.signIn')}
      </Button>
      <p className="text-center text-sm text-slate-500">{t('auth.or')}</p>
      <GoogleButton />
      <p className="text-center text-sm">
        {t('auth.noAccount')}{' '}
        <Link to="/register" className="font-medium text-indigo-700 underline">
          {t('auth.toRegister')}
        </Link>
      </p>
    </form>
  );
}
