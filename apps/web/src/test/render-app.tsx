import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { UserDto } from '@yet-to-be/shared';
import { http, HttpResponse } from 'msw';
import { createMemoryRouter } from 'react-router-dom';
import { AppProviders } from '../app/app';
import { routes } from '../app/routes';
import { createQueryClient } from '../shared/api/query-client';
import { server } from './server';

export const API = '/api/v1';

export const USER: UserDto = {
  id: 'u1',
  email: 'ada@example.com',
  displayName: 'Ада',
  firstName: null,
  lastName: null,
  bio: null,
  avatarUrl: null,
  providers: ['password'],
  createdAt: '2026-01-01T00:00:00.000Z',
};

/** Сесія: користувач або гість; `roles` — ролі адмінки (порожньо — звичайний користувач). */
export function mockSession(user: UserDto | null, roles: string[] = []): void {
  server.use(
    http.get(`*${API}/auth/session`, () =>
      user
        ? HttpResponse.json({ user, access: { roles, permissions: [], isOwner: false } })
        : HttpResponse.json({ code: 'UNAUTHORIZED', message: 'x' }, { status: 401 }),
    ),
    // Для гостя refresh теж не проходить
    http.post(`*${API}/auth/refresh`, () =>
      HttpResponse.json({ code: 'UNAUTHORIZED', message: 'x' }, { status: 401 }),
    ),
  );
}

export function renderApp(path: string) {
  document.cookie = 'ytb_csrf=test-token; path=/';
  const queryClient = createQueryClient();
  queryClient.setDefaultOptions({ queries: { retry: false } });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<AppProviders client={queryClient} router={router} />);
  return { queryClient, router, user: userEvent.setup() };
}
