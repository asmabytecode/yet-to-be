import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { API, mockSession, renderApp, USER } from '../test/render-app';
import { server } from '../test/server';

function eventsHandler() {
  server.use(http.get(`*${API}/events`, () => HttpResponse.json({ items: [], nextCursor: null })));
}

describe('посилання на адмінку в меню', () => {
  it('є в учасника команди й веде на /admin/', async () => {
    mockSession(USER, ['admin']);
    eventsHandler();
    renderApp('/events');
    const nav = await screen.findByRole('navigation', { name: 'Основна навігація' });
    expect(await within(nav).findByRole('link', { name: 'Адмінка' })).toHaveAttribute(
      'href',
      '/admin/',
    );
  });

  it('немає у звичайного користувача й гостя', async () => {
    mockSession(USER);
    eventsHandler();
    renderApp('/events');
    const nav = await screen.findByRole('navigation', { name: 'Основна навігація' });
    expect(await within(nav).findByRole('link', { name: 'Профіль' })).toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: 'Адмінка' })).not.toBeInTheDocument();
  });
});
