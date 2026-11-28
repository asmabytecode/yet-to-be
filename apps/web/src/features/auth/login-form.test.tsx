import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '../../test/server';
import { API, mockSession, renderApp, USER } from '../../test/render-app';

describe('LoginForm', () => {
  it('показує помилки валідації й не надсилає запит', async () => {
    mockSession(null);
    let called = false;
    server.use(
      http.post(`*${API}/auth/login`, () => {
        called = true;
        return HttpResponse.json({ user: USER });
      }),
    );
    const { user } = renderApp('/login');

    await user.click(await screen.findByRole('button', { name: 'Увійти' }));

    expect((await screen.findAllByRole('alert')).length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(called).toBe(false);
  });

  it('успішний вхід веде на головну', async () => {
    mockSession(null);
    server.use(http.post(`*${API}/auth/login`, () => HttpResponse.json({ user: USER })));
    const { user } = renderApp('/login');

    await user.type(await screen.findByLabelText('Email'), 'ada@example.com');
    await user.type(screen.getByLabelText('Пароль'), 'correct horse battery');
    await user.click(screen.getByRole('button', { name: 'Увійти' }));

    expect(await screen.findByRole('heading', { name: 'Вітаємо, Ада!' })).toBeInTheDocument();
  });

  it('невірні дані показують загальну помилку', async () => {
    mockSession(null);
    server.use(
      http.post(`*${API}/auth/login`, () =>
        HttpResponse.json({ code: 'AUTH_INVALID_CREDENTIALS', message: 'x' }, { status: 401 }),
      ),
    );
    const { user } = renderApp('/login');

    await user.type(await screen.findByLabelText('Email'), 'ada@example.com');
    await user.type(screen.getByLabelText('Пароль'), 'wrong password');
    await user.click(screen.getByRole('button', { name: 'Увійти' }));

    expect(await screen.findByText('Невірний email або пароль.')).toBeInTheDocument();
  });

  it('після невдалого входу через Google показує повідомлення', async () => {
    mockSession(null);
    renderApp('/login?error=oauth_failed');
    expect(await screen.findByText(/Не вдалося увійти через Google/)).toBeInTheDocument();
  });

  it('повідомляє, що акаунт заблоковано адміністратором', async () => {
    mockSession(null);
    renderApp('/login?error=account_blocked');
    expect(await screen.findByText('Акаунт заблоковано адміністратором.')).toBeInTheDocument();
  });
});
