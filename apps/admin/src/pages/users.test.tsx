import { screen, waitFor, within } from '@testing-library/react';
import type { AdminUserDetailDto } from '@yet-to-be/shared';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { access, API, apiError, mockAdmin, OWNER, renderAdmin } from '../test/render-admin';
import { server } from '../test/server';

const TARGET: AdminUserDetailDto = {
  id: '22222222-2222-4222-8222-222222222222',
  displayName: 'Борис',
  status: 'active',
  roles: ['admin'],
  createdAt: '2030-01-01T00:00:00.000Z',
  lastLoginAt: null,
  blockedAt: null,
  email: null,
  blockReason: null,
  mfaEnabled: true,
};

describe('користувачі', () => {
  it('без права users:read_pii email приховано, без users:block кнопки немає', async () => {
    mockAdmin(access('users:read'), { required: false });
    server.use(http.get(`*${API}/admin/users/${TARGET.id}`, () => HttpResponse.json(TARGET)));
    renderAdmin(`/users/${TARGET.id}`);
    expect(await screen.findByText('приховано (немає права users:read_pii)')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Заблокувати' })).not.toBeInTheDocument();
  });

  it('блокування адміна просить підтвердження й повторює запит', async () => {
    let attempts = 0;
    let blocked = false;
    let stepUpBody: unknown;
    mockAdmin(OWNER);
    server.use(
      http.get(`*${API}/admin/users/${TARGET.id}`, () =>
        HttpResponse.json(
          blocked ? { ...TARGET, status: 'blocked', blockReason: 'Порушення правил' } : TARGET,
        ),
      ),
      http.post(`*${API}/admin/users/${TARGET.id}/block`, () => {
        attempts += 1;
        if (attempts === 1) return apiError(403, 'REAUTH_REQUIRED');
        blocked = true;
        return new HttpResponse(null, { status: 204 });
      }),
      http.post(`*${API}/auth/step-up`, async ({ request }) => {
        stepUpBody = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { user } = renderAdmin(`/users/${TARGET.id}`);

    await user.click(await screen.findByRole('button', { name: 'Заблокувати' }));
    const dialog = screen.getByRole('dialog', { name: 'Заблокувати' });
    await user.type(within(dialog).getByLabelText(/Причина/), 'Порушення правил');
    await user.click(within(dialog).getByRole('button', { name: 'Заблокувати' }));

    const stepUp = await screen.findByRole('dialog', { name: 'Підтвердьте дію' });
    await user.type(within(stepUp).getByLabelText('Пароль'), 'correct horse');
    await user.click(within(stepUp).getByRole('button', { name: 'Підтвердити' }));

    expect(await screen.findByText('Заблокований')).toBeInTheDocument();
    await waitFor(() => {
      expect(attempts).toBe(2);
    });
    expect(stepUpBody).toEqual({ password: 'correct horse' });
  });

  it('закоротка причина не відправляється', async () => {
    let attempts = 0;
    mockAdmin(OWNER);
    server.use(
      http.get(`*${API}/admin/users/${TARGET.id}`, () => HttpResponse.json(TARGET)),
      http.post(`*${API}/admin/users/${TARGET.id}/block`, () => {
        attempts += 1;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { user } = renderAdmin(`/users/${TARGET.id}`);
    await user.click(await screen.findByRole('button', { name: 'Заблокувати' }));
    const dialog = screen.getByRole('dialog', { name: 'Заблокувати' });
    await user.type(within(dialog).getByLabelText(/Причина/), 'коротко');
    await user.click(within(dialog).getByRole('button', { name: 'Заблокувати' }));
    expect(within(dialog).getByRole('alert')).toBeInTheDocument();
    expect(attempts).toBe(0);
  });
});
