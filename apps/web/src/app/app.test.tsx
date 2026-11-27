import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { SESSION_KEY } from '../shared/api/query-client';
import { server } from '../test/server';
import { API, mockSession, renderApp, USER } from '../test/render-app';

describe('маршрутизація', () => {
  it('гість на /profile потрапляє на сторінку входу', async () => {
    mockSession(null);
    renderApp('/profile');
    expect(await screen.findByRole('heading', { name: 'Вхід' })).toBeInTheDocument();
  });

  it('авторизований користувач на /login потрапляє на головну', async () => {
    mockSession(USER);
    renderApp('/login');
    expect(await screen.findByRole('heading', { name: 'Вітаємо, Ада!' })).toBeInTheDocument();
  });

  it('у header показано ім’я поточного користувача', async () => {
    mockSession(USER);
    renderApp('/');
    const header = await screen.findByRole('banner');
    expect(await within(header).findByText('Ада')).toBeInTheDocument();
  });

  it('невідомий шлях показує 404', async () => {
    mockSession(null);
    renderApp('/nope');
    expect(
      await screen.findByRole('heading', { name: 'Сторінку не знайдено' }),
    ).toBeInTheDocument();
  });

  it('вихід очищає кеш і веде на /login', async () => {
    mockSession(USER);
    server.use(http.post(`*${API}/auth/logout`, () => new HttpResponse(null, { status: 204 })));
    const { queryClient, user } = renderApp('/');

    await user.click(await screen.findByRole('button', { name: 'Вийти' }));

    expect(await screen.findByRole('heading', { name: 'Вхід' })).toBeInTheDocument();
    expect(queryClient.getQueryData(SESSION_KEY)).toBeNull();
  });
});
