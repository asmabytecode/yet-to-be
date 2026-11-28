import { useQuery } from '@tanstack/react-query';
import type { Permission } from '@yet-to-be/shared';
import { Card, linkButtonClass, Spinner } from '@yet-to-be/ui';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet } from 'react-router-dom';
import { adminApi, keys } from '../api/admin-api';
import { MfaSetup } from '../features/mfa/mfa-setup';
import { MfaVerify } from '../features/mfa/mfa-verify';
import { useAdminSession, useCan } from './access';

export function Forbidden() {
  const { t } = useTranslation();
  return (
    <Card className="mx-auto max-w-md space-y-2 text-center">
      <h1 className="text-xl font-semibold">{t('gate.forbiddenTitle')}</h1>
      <p className="text-sm text-slate-700">{t('gate.forbiddenText')}</p>
      <a className={linkButtonClass()} href="/">
        {t('app.toSite')}
      </a>
    </Card>
  );
}

/**
 * Вхід в адмінку: (1) сесія є — інакше на сайт до форми входу; (2) хоча б одна роль — інакше
 * 403; (3) якщо роль вимагає MFA — налаштувати або підтвердити її. Сервер перевіряє все те саме.
 */
export function AdminGate() {
  const { t } = useTranslation();
  const session = useAdminSession();
  const access = session.data?.access;
  const isMember = access !== undefined && (access.isOwner || access.roles.length > 0);
  const mfa = useQuery({ queryKey: keys.mfa, queryFn: adminApi.mfa.status, enabled: isMember });

  if (session.isPending) return <Spinner label={t('app.loading')} />;
  if (session.data === null || session.data === undefined) {
    return (
      <Card className="mx-auto mt-16 max-w-md space-y-3 text-center">
        <h1 className="text-xl font-semibold">{t('gate.loginTitle')}</h1>
        <p className="text-sm text-slate-700">{t('gate.loginText')}</p>
        <a className={linkButtonClass('primary')} href="/login">
          {t('gate.loginAction')}
        </a>
      </Card>
    );
  }
  if (!isMember) {
    return (
      <div className="mt-16 px-4">
        <Forbidden />
      </div>
    );
  }
  if (mfa.isPending) return <Spinner label={t('app.loading')} />;
  if (mfa.data?.required === true && !mfa.data.enabled) {
    return (
      <div className="mx-auto mt-16 max-w-lg px-4">
        <MfaSetup />
      </div>
    );
  }
  if (mfa.data?.required === true && !mfa.data.sessionVerified) {
    return (
      <div className="mt-16 px-4">
        <MfaVerify />
      </div>
    );
  }
  return <Outlet />;
}

/** Розділ із правами: без них — 403 усередині макета (а не редірект). */
export function RequirePermissions({
  permissions,
  children,
}: {
  permissions: Permission[];
  children: ReactNode;
}) {
  const can = useCan();
  return can(...permissions) ? children : <Forbidden />;
}
