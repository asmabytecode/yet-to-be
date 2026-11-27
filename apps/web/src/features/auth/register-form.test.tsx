import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '../../test/server';
import { API, mockSession, renderApp, USER } from '../../test/render-app';

describe('RegisterForm', () => {
  it('зайнятий email показується біля поля email', async () => {
    mockSession(null);
    server.use(
      http.post(`*${API}/auth/register`, () =>
        HttpResponse.json({ code: 'AUTH_EMAIL_TAKEN', message: 'x' }, { status: 409 }),
      ),
    );
    const { user } = renderApp('/register');

    await user.type(await screen.findByLabelText("Ім'я"), 'Ада');
    await user.type(screen.getByLabelText('Email'), 'ada@example.com');
    await user.type(screen.getByLabelText('Пароль'), 'correct horse battery');
    await user.click(screen.getByRole('button', { name: 'Зареєструватися' }));

    expect(await screen.findByText('Цей email уже зареєстровано.')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
  });

  it('успішна реєстрація веде на головну', async () => {
    mockSession(null);
    server.use(http.post(`*${API}/auth/register`, () => HttpResponse.json({ user: USER }, { status: 201 })));
    const { user } = renderApp('/register');

    await user.type(await screen.findByLabelText("Ім'я"), 'Ада');
    await user.type(screen.getByLabelText('Email'), 'ada@example.com');
    await user.type(screen.getByLabelText('Пароль'), 'correct horse battery');
    await user.click(screen.getByRole('button', { name: 'Зареєструватися' }));

    expect(await screen.findByRole('heading', { name: 'Вітаємо, Ада!' })).toBeInTheDocument();
  });
});
