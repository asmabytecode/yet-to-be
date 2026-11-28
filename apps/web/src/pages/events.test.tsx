import { screen, within } from '@testing-library/react';
import type { MyRegistrationDto, PublicEventDto, PublicEventSummary } from '@yet-to-be/shared';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { API, mockSession, renderApp, USER } from '../test/render-app';
import { server } from '../test/server';

const EVENT: PublicEventDto = {
  id: '11111111-1111-4111-8111-111111111111',
  slug: 'kyiv-meetup',
  status: 'published',
  title: 'Kyiv meetup',
  summary: 'Зустріч спільноти',
  startsAt: '2030-05-01T15:00:00.000Z',
  endsAt: '2030-05-01T18:00:00.000Z',
  timezone: 'Europe/Kyiv',
  venueName: 'Хаб',
  online: true,
  tags: [],
  cover: null,
  description: '**Важливо:** <script>alert(1)</script> [зло](javascript:alert(1))',
  address: 'вул. Хрещатик, 1',
  onlineUrl: 'https://stream.example.com/live',
  capacity: 10,
  spotsLeft: 3,
  registrationOpen: true,
  blocks: [
    { type: 'agenda_item', time: '18:00', title: 'Відкриття', description: null },
    { type: 'speaker', name: 'Оля', role: 'Інженерка', bio: null, photo: null },
    { type: 'link', label: 'Чат', url: 'https://t.me/example' },
  ],
};

const SUMMARY: PublicEventSummary = {
  id: EVENT.id,
  slug: EVENT.slug,
  status: EVENT.status,
  title: EVENT.title,
  summary: EVENT.summary,
  startsAt: EVENT.startsAt,
  endsAt: EVENT.endsAt,
  timezone: EVENT.timezone,
  venueName: EVENT.venueName,
  online: EVENT.online,
  tags: EVENT.tags,
  cover: EVENT.cover,
};

function eventHandlers(mine: () => MyRegistrationDto[] = () => []) {
  server.use(
    http.get(`*${API}/events`, () => HttpResponse.json({ items: [SUMMARY], nextCursor: null })),
    http.get(`*${API}/events/${EVENT.slug}`, () => HttpResponse.json(EVENT)),
    http.get(`*${API}/users/me/registrations`, () =>
      HttpResponse.json({ items: mine(), nextCursor: null }),
    ),
  );
}

describe('публічні події', () => {
  it('гість бачить список і сторінку, але для запису має увійти', async () => {
    mockSession(null);
    eventHandlers();
    const { user } = renderApp('/events');

    await user.click(await screen.findByRole('link', { name: 'Kyiv meetup' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Kyiv meetup' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Увійдіть, щоб записатися' })).toHaveAttribute(
      'href',
      '/login',
    );
    expect(screen.getByText('Вільних місць: 3')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Посилання на трансляцію' })).toHaveAttribute(
      'href',
      'https://stream.example.com/live',
    );
    // Markdown: форматування є, сирого HTML і javascript:-посилань немає.
    expect(screen.getByText('Важливо:').tagName).toBe('STRONG');
    expect(document.querySelector('article script')).toBeNull();
    expect(screen.queryByRole('link', { name: 'зло' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Програма' })).toBeInTheDocument();
    expect(screen.getByText('Оля')).toBeInTheDocument();
    const header = screen.getByRole('banner');
    expect(within(header).getByRole('link', { name: 'Увійти' })).toBeInTheDocument();
    expect(within(header).queryByRole('button', { name: 'Вийти' })).not.toBeInTheDocument();
  });

  it('користувач записується, і кнопка змінюється на «Ви записані»', async () => {
    let registered = false;
    mockSession(USER);
    eventHandlers(() =>
      registered
        ? [
            {
              id: 'r1',
              status: 'registered',
              createdAt: '2030-01-01T00:00:00.000Z',
              event: SUMMARY,
            },
          ]
        : [],
    );
    server.use(
      http.delete(`*${API}/events/${EVENT.id}/registrations/me`, () => {
        registered = false;
        return new HttpResponse(null, { status: 204 });
      }),
      http.post(`*${API}/events/${EVENT.id}/registrations`, () => {
        registered = true;
        return HttpResponse.json(
          { id: 'r1', status: 'registered', createdAt: '2030-01-01T00:00:00.000Z', event: SUMMARY },
          { status: 201 },
        );
      }),
    );
    const { user } = renderApp(`/events/${EVENT.slug}`);

    await user.click(await screen.findByRole('button', { name: 'Записатися' }));
    expect(await screen.findByText('Ви записані')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Скасувати запис' }));
    expect(await screen.findByRole('button', { name: 'Записатися' })).toBeInTheDocument();
    expect(registered).toBe(false);
  });

  it('показує зрозумілу помилку, коли місць уже немає', async () => {
    mockSession(USER);
    eventHandlers();
    server.use(
      http.post(`*${API}/events/${EVENT.id}/registrations`, () =>
        HttpResponse.json({ code: 'EVENT_FULL', message: 'x' }, { status: 409 }),
      ),
    );
    const { user } = renderApp(`/events/${EVENT.slug}`);
    await user.click(await screen.findByRole('button', { name: 'Записатися' }));
    expect(await screen.findByText('Місць більше немає.')).toBeInTheDocument();
  });

  it('неіснуюча подія — повідомлення й посилання назад', async () => {
    mockSession(null);
    server.use(
      http.get(`*${API}/events/nope`, () =>
        HttpResponse.json({ code: 'NOT_FOUND', message: 'x' }, { status: 404 }),
      ),
    );
    renderApp('/events/nope');
    expect(await screen.findByText('Не знайдено.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'До всіх подій' })).toBeInTheDocument();
  });
});
