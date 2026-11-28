import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { access, API, mockAdmin, OWNER, renderAdmin } from '../test/render-admin';
import { server } from '../test/server';

describe('вхід в адмінку', () => {
  it('гостю пропонує увійти на сайті', async () => {
    mockAdmin(null);
    renderAdmin('/');
    expect(await screen.findByRole('heading', { name: 'Потрібно увійти' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Перейти до входу' })).toHaveAttribute(
      'href',
      '/login',
    );
  });

  it('користувач без ролей бачить 403', async () => {
    mockAdmin({ roles: [], permissions: [], isOwner: false });
    renderAdmin('/');
    expect(await screen.findByRole('heading', { name: 'Немає доступу' })).toBeInTheDocument();
  });

  it('роль із MFA без налаштованого MFA веде на налаштування', async () => {
    mockAdmin(OWNER, { enabled: false, sessionVerified: false });
    renderAdmin('/');
    expect(
      await screen.findByRole('heading', { name: 'Налаштуйте застосунок-автентифікатор' }),
    ).toBeInTheDocument();
  });

  it('нова сесія спершу підтверджує MFA кодом', async () => {
    let verified = false;
    let body: unknown;
    mockAdmin(OWNER, { sessionVerified: false });
    server.use(
      http.get(`*${API}/auth/mfa`, () =>
        HttpResponse.json({
          enabled: true,
          required: true,
          sessionVerified: verified,
          stepUpUntil: null,
        }),
      ),
      http.post(`*${API}/auth/mfa/verify`, async ({ request }) => {
        body = await request.json();
        verified = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { user } = renderAdmin('/');

    await user.type(await screen.findByLabelText('Код із застосунку'), '123456');
    await user.click(screen.getByRole('button', { name: 'Підтвердити' }));

    expect(await screen.findByRole('heading', { name: 'Огляд' })).toBeInTheDocument();
    expect(body).toEqual({ code: '123456' });
  });

  it('меню показує лише розділи, на які є права', async () => {
    mockAdmin(access('events:read'), { required: false, enabled: false, sessionVerified: false });
    renderAdmin('/');
    const nav = await screen.findByRole('navigation');
    expect(within(nav).getByRole('link', { name: 'Події' })).toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: 'Журнал дій' })).not.toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: 'Ролі' })).not.toBeInTheDocument();
  });

  it('розділ без прав показує 403 усередині макета', async () => {
    mockAdmin(access('events:read'), { required: false });
    renderAdmin('/audit');
    expect(await screen.findByRole('heading', { name: 'Немає доступу' })).toBeInTheDocument();
    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });

  it('невідомий шлях — 404', async () => {
    mockAdmin(OWNER);
    renderAdmin('/nope');
    expect(
      await screen.findByRole('heading', { name: 'Сторінку не знайдено' }),
    ).toBeInTheDocument();
  });
});
