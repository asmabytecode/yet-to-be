import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '../../test/server';
import { API, mockSession, renderApp, USER } from '../../test/render-app';
import { changedFields } from './profile-form';

const SESSIONS = [
  {
    id: 's1',
    createdAt: '2026-01-01T00:00:00.000Z',
    lastUsedAt: '2026-01-02T00:00:00.000Z',
    userAgent: 'Firefox',
    isCurrent: true,
  },
  {
    id: 's2',
    createdAt: '2026-01-01T00:00:00.000Z',
    lastUsedAt: '2026-01-01T00:00:00.000Z',
    userAgent: '<b>Evil</b>',
    isCurrent: false,
  },
];

function profileHandlers() {
  server.use(http.get(`*${API}/users/me/sessions`, () => HttpResponse.json(SESSIONS)));
}

describe('changedFields', () => {
  it('повертає лише змінені поля', () => {
    const initial = { displayName: 'A', firstName: '', lastName: '', bio: '' };
    expect(changedFields(initial, { ...initial, bio: 'hi' })).toEqual({ bio: 'hi' });
    expect(changedFields(initial, initial)).toEqual({});
  });
});

describe('ProfilePage', () => {
  it('надсилає лише змінені поля', async () => {
    mockSession(USER);
    profileHandlers();
    let body: unknown;
    server.use(
      http.patch(`*${API}/users/me`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ ...USER, bio: 'Привіт' });
      }),
    );
    const { user } = renderApp('/profile');

    await user.type(await screen.findByLabelText('Про себе'), 'Привіт');
    await user.click(screen.getByRole('button', { name: 'Зберегти' }));

    await waitFor(() => {
      expect(body).toEqual({ bio: 'Привіт' });
    });
    expect(await screen.findByText('Профіль оновлено')).toBeInTheDocument();
  });

  it('без змін нічого не надсилає', async () => {
    mockSession(USER);
    profileHandlers();
    let called = false;
    server.use(
      http.patch(`*${API}/users/me`, () => {
        called = true;
        return HttpResponse.json(USER);
      }),
    );
    const { user } = renderApp('/profile');

    await user.click(await screen.findByRole('button', { name: 'Зберегти' }));

    expect(await screen.findByText('Немає змін для збереження')).toBeInTheDocument();
    expect(called).toBe(false);
  });

  it('показує сесії як текст і дозволяє завершити не поточну', async () => {
    mockSession(USER);
    profileHandlers();
    let revoked: string | undefined;
    server.use(
      http.delete(`*${API}/users/me/sessions/:id`, ({ params }) => {
        revoked = String(params['id']);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { user } = renderApp('/profile');

    // HTML у userAgent не інтерпретується
    expect(await screen.findByText('<b>Evil</b>')).toBeInTheDocument();
    const revokeButtons = screen.getAllByRole('button', { name: 'Завершити' });
    expect(revokeButtons).toHaveLength(1);
    await user.click(revokeButtons[0] as HTMLElement);

    await waitFor(() => {
      expect(revoked).toBe('s2');
    });
  });

  it('для акаунта без пароля пропонує його встановити, а Google відв’язати не дає', async () => {
    mockSession({ ...USER, providers: ['google'] });
    profileHandlers();
    renderApp('/profile');

    expect(await screen.findByRole('button', { name: 'Встановити пароль' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Поточний пароль')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Відв’язати Google' })).toBeDisabled();
  });

  it('зміна пароля: неправильний поточний пароль показується біля поля', async () => {
    mockSession(USER);
    profileHandlers();
    server.use(
      http.put(`*${API}/users/me/password`, () =>
        HttpResponse.json({ code: 'AUTH_INVALID_CREDENTIALS', message: 'x' }, { status: 400 }),
      ),
    );
    const { user } = renderApp('/profile');

    await user.type(await screen.findByLabelText('Поточний пароль'), 'old password 1');
    await user.type(screen.getByLabelText('Новий пароль'), 'brand new password 2');
    await user.click(screen.getByRole('button', { name: 'Змінити пароль' }));

    expect(await screen.findByText('Невірний email або пароль.')).toBeInTheDocument();
    expect(screen.getByLabelText('Поточний пароль')).toHaveAttribute('aria-invalid', 'true');
  });
});
