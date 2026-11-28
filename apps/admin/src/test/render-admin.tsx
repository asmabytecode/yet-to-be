import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  type AccessDto,
  type MfaStatus,
  PERMISSIONS,
  type Permission,
  type UserDto,
} from '@yet-to-be/shared';
import { http, HttpResponse } from 'msw';
import { createMemoryRouter } from 'react-router-dom';
import { AdminProviders, createQueryClient } from '../app/app';
import { routes } from '../app/routes';
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

export const OWNER: AccessDto = { roles: ['owner'], permissions: [...PERMISSIONS], isOwner: true };

export function access(...permissions: Permission[]): AccessDto {
  return { roles: ['editor'], permissions, isOwner: false };
}

const MFA_OK: MfaStatus = {
  enabled: true,
  required: true,
  sessionVerified: true,
  stepUpUntil: null,
};

export const unauthorized = () =>
  HttpResponse.json({ code: 'UNAUTHORIZED', message: 'x' }, { status: 401 });

export const apiError = (status: number, code: string) =>
  HttpResponse.json({ code, message: code, issues: [] }, { status });

/** Сесія адмінки: null — гість; інакше користувач із заданими правами й станом MFA. */
export function mockAdmin(accessDto: AccessDto | null, mfa: Partial<MfaStatus> = {}): void {
  server.use(
    http.get(`*${API}/auth/session`, () =>
      accessDto === null ? unauthorized() : HttpResponse.json({ user: USER, access: accessDto }),
    ),
    http.post(`*${API}/auth/refresh`, unauthorized),
    http.get(`*${API}/auth/mfa`, () => HttpResponse.json({ ...MFA_OK, ...mfa })),
  );
}

export function renderAdmin(path: string) {
  document.cookie = 'ytb_csrf=test-token; path=/';
  const queryClient = createQueryClient();
  queryClient.setDefaultOptions({ queries: { retry: false } });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<AdminProviders client={queryClient} router={router} />);
  return { queryClient, router, user: userEvent.setup() };
}
