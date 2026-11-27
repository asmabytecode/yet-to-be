import { useTranslation } from 'react-i18next';
import type { RouteObject } from 'react-router-dom';
import { AppLayout } from '../layouts/app-layout';
import { ErrorPage } from '../pages/error-page';
import { Spinner } from '../shared/ui/card';
import { GuestRoute, ProtectedRoute } from './guards';

/** Показується, поки підвантажується перша lazy-сторінка. */
function Loading() {
  const { t } = useTranslation();
  return <Spinner label={t('app.loading')} />;
}

/** Сторінки підвантажуються ліниво: на старті в бандл потрапляє лише каркас. */
export const routes: RouteObject[] = [
  {
    HydrateFallback: Loading,
    errorElement: <ErrorPage />,
    children: [
      {
        element: <GuestRoute />,
        children: [
          { path: '/login', lazy: async () => ({ Component: (await import('../pages/login-page')).LoginPage }) },
          { path: '/register', lazy: async () => ({ Component: (await import('../pages/register-page')).RegisterPage }) },
        ],
      },
      {
        element: <ProtectedRoute />,
        children: [
          {
            element: <AppLayout />,
            children: [
              { path: '/', lazy: async () => ({ Component: (await import('../pages/home-page')).HomePage }) },
              { path: '/profile', lazy: async () => ({ Component: (await import('../pages/profile-page')).ProfilePage }) },
            ],
          },
        ],
      },
      { path: '*', lazy: async () => ({ Component: (await import('../pages/not-found-page')).NotFoundPage }) },
    ],
  },
];
