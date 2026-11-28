import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { authApi } from '../features/auth/api';
import { useEndSession, useIsTeamMember, useSession } from '../features/auth/use-session';
import { cn } from '../shared/lib/cn';
import { Button } from '../shared/ui/button';

const linkClass = ({ isActive }: { isActive: boolean }): string =>
  cn(
    'rounded px-2 py-1 text-sm font-medium',
    isActive ? 'bg-indigo-100 text-indigo-900' : 'text-slate-700 hover:underline',
  );

export function AppLayout() {
  const { t } = useTranslation();
  const endSession = useEndSession();
  const { data: user } = useSession();
  const { data: member } = useIsTeamMember(user?.id);
  const navigate = useNavigate();

  const logout = useMutation({
    mutationFn: authApi.logout,
    // Навіть якщо сервер недоступний, локально сесію закінчуємо: cookie все одно протухне.
    onSettled: () => {
      endSession();
      void navigate('/login', { replace: true });
    },
  });

  return (
    <div className="min-h-screen">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:m-2 focus:rounded focus:bg-white focus:p-2"
      >
        {t('app.skipToContent')}
      </a>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-3">
          <span className="font-semibold tracking-wide">{t('app.name')}</span>
          <nav aria-label={t('nav.main')} className="flex items-center gap-2">
            {user ? (
              <span
                className="max-w-40 truncate text-sm text-slate-600"
                title={t('nav.signedInAs')}
              >
                {user.displayName}
              </span>
            ) : null}
            {user ? (
              <NavLink to="/" end className={linkClass}>
                {t('nav.home')}
              </NavLink>
            ) : null}
            <NavLink to="/events" className={linkClass}>
              {t('nav.events')}
            </NavLink>
            {user ? (
              <>
                <NavLink to="/profile" className={linkClass}>
                  {t('nav.profile')}
                </NavLink>
                {member === true ? (
                  // Адмінка — окремий застосунок під /admin/, тож звичайне посилання, не NavLink.
                  <a href="/admin/" className={linkClass({ isActive: false })}>
                    {t('nav.admin')}
                  </a>
                ) : null}
                <Button
                  variant="secondary"
                  onClick={() => {
                    logout.mutate();
                  }}
                  disabled={logout.isPending}
                >
                  {t('nav.logout')}
                </Button>
              </>
            ) : (
              <NavLink to="/login" className={linkClass}>
                {t('nav.login')}
              </NavLink>
            )}
          </nav>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto max-w-4xl space-y-6 px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
