import { useQuery } from '@tanstack/react-query';
import { Badge, Card } from '@yet-to-be/ui';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { adminApi, keys } from '../api/admin-api';
import { useAdminSession, useCan } from '../app/access';
import { SECTIONS } from '../app/registry';

export function DashboardPage() {
  const { t } = useTranslation();
  const session = useAdminSession();
  const can = useCan();
  const mfa = useQuery({ queryKey: keys.mfa, queryFn: adminApi.mfa.status });
  const roles = session.data?.access.roles ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{t('dashboard.title')}</h1>
      <Card className="space-y-2">
        <p className="text-lg">
          {t('dashboard.hello', { name: session.data?.user.displayName ?? '' })}
        </p>
        <p className="text-sm text-slate-700">
          {t('dashboard.roles', {
            roles: roles.length === 0 ? t('dashboard.noRoles') : roles.join(', '),
          })}
        </p>
        {mfa.data === undefined ? null : mfa.data.enabled ? (
          <Badge tone="success">{t('dashboard.mfaOn')}</Badge>
        ) : (
          <Badge tone="warning">{t('dashboard.mfaOff')}</Badge>
        )}
      </Card>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.filter((section) => section.path !== '/' && can(...section.permissions)).map(
          (section) => (
            <li key={section.path}>
              <Link
                to={section.path}
                className="block rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200 hover:ring-indigo-300"
              >
                {t(`nav.${section.label}`)}
              </Link>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}
