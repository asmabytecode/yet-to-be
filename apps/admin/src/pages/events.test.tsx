import { fireEvent, screen, waitFor } from '@testing-library/react';
import type { AdminEventDetailDto } from '@yet-to-be/shared';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { API, mockAdmin, OWNER, renderAdmin } from '../test/render-admin';
import { server } from '../test/server';

const EVENT: AdminEventDetailDto = {
  id: '11111111-1111-4111-8111-111111111111',
  slug: 'kyiv-meetup',
  status: 'draft',
  title: 'Kyiv meetup',
  summary: 'Зустріч',
  description: null,
  startsAt: '2030-05-01T15:00:00.000Z',
  endsAt: '2030-05-01T18:00:00.000Z',
  timezone: 'Europe/Kyiv',
  venueName: 'Хаб',
  address: null,
  onlineUrl: null,
  capacity: 50,
  coverAssetId: null,
  tags: ['meetup'],
  publishedAt: null,
  version: 3,
  createdAt: '2030-01-01T00:00:00.000Z',
  updatedAt: '2030-01-01T00:00:00.000Z',
  blocks: [],
};

const emptyList = () => HttpResponse.json({ items: [], nextCursor: null });

describe('події', () => {
  it('список показує події з API і фільтр статусу йде в запит', async () => {
    const seen: string[] = [];
    mockAdmin(OWNER);
    server.use(
      http.get(`*${API}/admin/events`, ({ request }) => {
        seen.push(new URL(request.url).search);
        return HttpResponse.json({ items: [EVENT], nextCursor: null });
      }),
    );
    const { user } = renderAdmin('/events');

    expect(await screen.findByRole('link', { name: 'Kyiv meetup' })).toHaveAttribute(
      'href',
      `/events/${EVENT.id}`,
    );
    expect(screen.getByRole('cell', { name: 'Чернетка' })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Статус'), 'published');
    await waitFor(() => {
      expect(seen.some((query) => query.includes('status=published'))).toBe(true);
    });
  });

  it('форма не відправляє некоректну подію', async () => {
    let posted = false;
    mockAdmin(OWNER);
    server.use(
      http.get(`*${API}/admin/media`, emptyList),
      http.post(`*${API}/admin/events`, () => {
        posted = true;
        return HttpResponse.json(EVENT);
      }),
    );
    const { user } = renderAdmin('/events/new');

    await user.type(await screen.findByLabelText('Назва'), 'ab');
    await user.click(screen.getByRole('button', { name: 'Створити' }));

    expect(await screen.findByText('Занадто коротко')).toBeInTheDocument();
    expect(screen.getAllByText("Обов'язкове поле").length).toBeGreaterThan(0);
    expect(posted).toBe(false);
  });

  it('створення надсилає ключ ідемпотентності й відкриває редактор', async () => {
    let key: string | null = null;
    let body: Record<string, unknown> = {};
    mockAdmin(OWNER);
    server.use(
      http.get(`*${API}/admin/media`, emptyList),
      http.post(`*${API}/admin/events`, async ({ request }) => {
        key = request.headers.get('Idempotency-Key');
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(EVENT, { status: 201 });
      }),
      http.get(`*${API}/admin/events/${EVENT.id}`, () => HttpResponse.json(EVENT)),
    );
    const { user } = renderAdmin('/events/new');

    await user.type(await screen.findByLabelText('Назва'), 'Kyiv meetup');
    // datetime-local у jsdom не набирається посимвольно — задаємо значення цілком.
    fireEvent.change(screen.getByLabelText('Початок'), { target: { value: '2030-05-01T18:00' } });
    fireEvent.change(screen.getByLabelText('Завершення'), {
      target: { value: '2030-05-01T21:00' },
    });
    await user.type(screen.getByLabelText('Теги через кому (латиниця)'), 'Meetup, kyiv');
    await user.click(screen.getByRole('button', { name: 'Створити' }));

    expect(await screen.findByRole('heading', { name: 'Kyiv meetup' })).toBeInTheDocument();
    expect(key).toMatch(/^[0-9a-f-]{36}$/);
    expect(body).toMatchObject({ title: 'Kyiv meetup', tags: ['meetup', 'kyiv'], capacity: null });
  });

  it('конфлікт версій показує вікно з пропозицією оновити', async () => {
    mockAdmin(OWNER);
    server.use(
      http.get(`*${API}/admin/media`, emptyList),
      http.get(`*${API}/admin/events/${EVENT.id}`, () => HttpResponse.json(EVENT)),
      http.post(`*${API}/admin/events/${EVENT.id}/transition`, () =>
        HttpResponse.json({ code: 'EVENT_VERSION_CONFLICT', message: 'x' }, { status: 409 }),
      ),
    );
    const { user } = renderAdmin(`/events/${EVENT.id}`);

    await user.click(await screen.findByRole('button', { name: 'Опублікувати' }));
    expect(await screen.findByRole('dialog', { name: 'Подію змінили' })).toBeInTheDocument();
  });

  it('незаповнена подія не публікується й показує, чого бракує', async () => {
    mockAdmin(OWNER);
    server.use(
      http.get(`*${API}/admin/media`, emptyList),
      http.get(`*${API}/admin/events/${EVENT.id}`, () => HttpResponse.json(EVENT)),
      http.post(`*${API}/admin/events/${EVENT.id}/transition`, () =>
        HttpResponse.json(
          {
            code: 'EVENT_INCOMPLETE',
            message: 'x',
            issues: [{ path: 'summary', code: 'required' }],
          },
          { status: 409 },
        ),
      ),
    );
    const { user } = renderAdmin(`/events/${EVENT.id}`);

    await user.click(await screen.findByRole('button', { name: 'Опублікувати' }));
    expect(await screen.findByText('Для публікації заповніть: Короткий опис')).toBeInTheDocument();
  });
});
