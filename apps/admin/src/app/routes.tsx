import type { Permission } from '@yet-to-be/shared';
import { Spinner } from '@yet-to-be/ui';
import type { ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet, type RouteObject, useRouteError } from 'react-router-dom';
import { AdminLayout } from '../layout/admin-layout';
import { errorMessage } from '../shared-errors';
import { AdminGate, RequirePermissions } from './gates';

function Loading() {
  const { t } = useTranslation();
  return <Spinner label={t('app.loading')} />;
}

function RouteError() {
  const error = useRouteError();
  return (
    <p role="alert" className="p-6 text-sm text-red-800">
      {errorMessage(error)}
    </p>
  );
}

/**
 * Сторінка розділу: права перевіряються до завантаження коду сторінки (без прав — 403 у
 * макеті). Сервер однаково перевіряє кожен запит; це лише зручність і менший бандл.
 */
function page(
  path: string,
  permissions: Permission[],
  load: () => Promise<ComponentType>,
): RouteObject {
  return {
    element: (
      <RequirePermissions permissions={permissions}>
        <Outlet />
      </RequirePermissions>
    ),
    children: [{ path, lazy: async () => ({ Component: await load() }) }],
  };
}

export const routes: RouteObject[] = [
  {
    HydrateFallback: Loading,
    errorElement: <RouteError />,
    element: <AdminGate />,
    children: [
      {
        element: <AdminLayout />,
        children: [
          page('/', [], async () => (await import('../pages/dashboard-page')).DashboardPage),
          page('/security', [], async () => (await import('../pages/security-page')).SecurityPage),
          page(
            '/events',
            ['events:read'],
            async () => (await import('../pages/events-list-page')).EventsListPage,
          ),
          page(
            '/events/new',
            ['events:write'],
            async () => (await import('../pages/event-editor-page')).EventNewPage,
          ),
          page(
            '/events/:id',
            ['events:read'],
            async () => (await import('../pages/event-editor-page')).EventEditorPage,
          ),
          page(
            '/events/:id/registrations',
            ['registrations:read'],
            async () => (await import('../pages/event-registrations-page')).EventRegistrationsPage,
          ),
          page(
            '/media',
            ['media:write'],
            async () => (await import('../pages/media-page')).MediaPage,
          ),
          page(
            '/users',
            ['users:read'],
            async () => (await import('../pages/users-page')).UsersPage,
          ),
          page(
            '/users/:id',
            ['users:read'],
            async () => (await import('../pages/user-detail-page')).UserDetailPage,
          ),
          page('/team', ['roles:read'], async () => (await import('../pages/team-page')).TeamPage),
          page(
            '/roles',
            ['roles:read'],
            async () => (await import('../pages/roles-page')).RolesPage,
          ),
          page(
            '/audit',
            ['audit:read'],
            async () => (await import('../pages/audit-page')).AuditPage,
          ),
          page('*', [], async () => (await import('../pages/not-found-page')).NotFoundPage),
        ],
      },
    ],
  },
];
