import { safeReturnTo } from '@yet-to-be/shared';
import { useTranslation } from 'react-i18next';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useSession } from '../features/auth/use-session';
import { Spinner } from '../shared/ui/card';

interface FromState {
  from?: string;
}

/** Лише для авторизованих. Гостя відправляє на /login, запам'ятавши, куди він ішов. */
export function ProtectedRoute() {
  const { t } = useTranslation();
  const session = useSession();
  const location = useLocation();

  if (session.isPending) return <Spinner label={t('app.loading')} />;
  if (session.data === null || session.data === undefined) {
    return <Navigate to="/login" replace state={{ from: location.pathname } satisfies FromState} />;
  }
  return <Outlet />;
}

/** Лише для гостей (/login, /register). Авторизованого — на головну або туди, куди він ішов. */
export function GuestRoute() {
  const { t } = useTranslation();
  const session = useSession();
  const location = useLocation();

  if (session.isPending) return <Spinner label={t('app.loading')} />;
  if (session.data !== null && session.data !== undefined) {
    const from = (location.state as FromState | null)?.from;
    // Лише allowlist відносних шляхів: жодних open redirect.
    return <Navigate to={safeReturnTo(from)} replace />;
  }
  return <Outlet />;
}
