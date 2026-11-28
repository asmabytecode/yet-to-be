import { screen, waitFor, within } from '@testing-library/react';
import type {
  AdminEventDetailDto,
  AdminRegistrationDto,
  AdminUserDto,
  MediaAssetDto,
  MemberDto,
  RoleDto,
} from '@yet-to-be/shared';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { API, mockAdmin, OWNER, renderAdmin } from '../test/render-admin';
import { server } from '../test/server';

const R0 = '33333333-3333-4333-8333-333333333330';
const R1 = '33333333-3333-4333-8333-333333333331';

const ROLE = (over: Partial<RoleDto>): RoleDto => ({
  id: R1,
  key: 'editor',
  name: 'Редактор',
  description: null,
  isSystem: false,
  requiresMfa: false,
  permissions: ['events:read'],
  memberCount: 0,
  createdAt: '2030-01-01T00:00:00.000Z',
  ...over,
});

const OWNER_ROLE = ROLE({
  id: R0,
  key: 'owner',
  name: 'Власник',
  isSystem: true,
  requiresMfa: true,
});
const EDITOR = ROLE({});

function rolesHandlers(
  onWrite: (method: string, url: string, body: unknown) => void = () => undefined,
) {
  server.use(
    http.get(`*${API}/admin/roles`, () =>
      HttpResponse.json({ items: [OWNER_ROLE, EDITOR], nextCursor: null }),
    ),
    http.get(`*${API}/admin/roles/catalog`, () =>
      HttpResponse.json({ permissions: ['events:read', 'events:write'] }),
    ),
    http.post(`*${API}/admin/roles`, async ({ request }) => {
      onWrite('POST', request.url, await request.json());
      return HttpResponse.json(ROLE({ id: 'r9', key: 'moderator' }), { status: 201 });
    }),
    http.patch(`*${API}/admin/roles/:id`, async ({ request }) => {
      onWrite('PATCH', request.url, await request.json());
      return HttpResponse.json(EDITOR);
    }),
    http.delete(`*${API}/admin/roles/:id`, ({ request }) => {
      onWrite('DELETE', request.url, null);
      return new HttpResponse(null, { status: 204 });
    }),
  );
}

describe('ролі', () => {
  it('створює роль з обраними правами', async () => {
    const writes: [string, string, unknown][] = [];
    mockAdmin(OWNER);
    rolesHandlers((...args) => writes.push(args));
    const { user } = renderAdmin('/roles');

    expect(await screen.findByRole('heading', { name: 'Власник' })).toBeInTheDocument();
    expect(screen.getByText('системна')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Нова роль' }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('Ключ (латиниця, напр. editor)'), 'moderator');
    await user.type(within(dialog).getByLabelText('Назва'), 'Модератор');
    await user.click(within(dialog).getByLabelText(/Перегляд подій/));
    await user.click(within(dialog).getByRole('button', { name: 'Зберегти' }));

    expect(await screen.findByText('Роль створено')).toBeInTheDocument();
    expect(writes[0]?.[0]).toBe('POST');
    expect(writes[0]?.[2]).toEqual({
      key: 'moderator',
      name: 'Модератор',
      requiresMfa: false,
      permissions: ['events:read'],
    });
  });

  it('редагує й видаляє несистемну роль (з підтвердженням ключем)', async () => {
    const writes: [string, string, unknown][] = [];
    mockAdmin(OWNER);
    rolesHandlers((...args) => writes.push(args));
    const { user } = renderAdmin('/roles');

    await user.click(await screen.findByRole('button', { name: 'Редагувати' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByLabelText(/Створення й редагування подій/));
    await user.click(within(dialog).getByRole('button', { name: 'Зберегти' }));
    await waitFor(() => {
      expect(writes.map(([method]) => method)).toEqual(['PATCH']);
    });
    expect(writes[0]?.[2]).toMatchObject({ permissions: ['events:read', 'events:write'] });

    await user.click(screen.getByRole('button', { name: 'Видалити' }));
    const confirm = screen.getByRole('dialog', { name: 'Видалити роль?' });
    const button = within(confirm).getByRole('button', { name: 'Видалити' });
    expect(button).toBeDisabled();
    await user.type(within(confirm).getByRole('textbox'), 'editor');
    await user.click(button);
    await waitFor(() => {
      expect(writes.at(-1)?.[0]).toBe('DELETE');
    });
    expect(writes.at(-1)?.[1]).toContain(`/admin/roles/${R1}`);
  });
});

describe('команда', () => {
  const MEMBERS: MemberDto[] = [
    { userId: 'u1', displayName: 'Ада', roles: [{ id: R0, key: 'owner', name: 'Власник' }] },
    { userId: 'u2', displayName: 'Борис', roles: [{ id: R1, key: 'editor', name: 'Редактор' }] },
  ];

  it('видає роль за email і забирає роль в іншого учасника, але не в себе', async () => {
    let granted: unknown;
    let revoked = '';
    mockAdmin(OWNER);
    rolesHandlers();
    server.use(
      http.get(`*${API}/admin/members`, () =>
        HttpResponse.json({ items: MEMBERS, nextCursor: null }),
      ),
      http.post(`*${API}/admin/members`, async ({ request }) => {
        granted = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
      http.delete(`*${API}/admin/members/:userId/roles/:roleId`, ({ params }) => {
        revoked = `${String(params['userId'])}/${String(params['roleId'])}`;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { user } = renderAdmin('/team');

    expect(await screen.findByText('Борис')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Забрати: Власник' })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Email користувача'), 'new@example.com');
    await user.selectOptions(screen.getByLabelText('Роль'), R1);
    await user.click(screen.getByRole('button', { name: 'Видати' }));
    expect(await screen.findByText('Роль видано')).toBeInTheDocument();
    expect(granted).toEqual({ email: 'new@example.com', roleId: R1 });

    await user.click(screen.getByRole('button', { name: 'Забрати: Редактор' }));
    expect(await screen.findByText('Роль забрано')).toBeInTheDocument();
    expect(revoked).toBe(`u2/${R1}`);
  });

  it('некоректний email не відправляється', async () => {
    mockAdmin(OWNER);
    rolesHandlers();
    server.use(
      http.get(`*${API}/admin/members`, () => HttpResponse.json({ items: [], nextCursor: null })),
    );
    const { user } = renderAdmin('/team');
    await user.type(await screen.findByLabelText('Email користувача'), 'not-an-email');
    await user.click(screen.getByRole('button', { name: 'Видати' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});

describe('медіатека', () => {
  const READY: MediaAssetDto = {
    id: 'm1',
    status: 'ready',
    rejectReason: null,
    width: 800,
    height: 600,
    variants: { thumb: '/media/m1/thumb-abc.webp' },
    createdAt: '2030-01-01T00:00:00.000Z',
  };
  const REJECTED: MediaAssetDto = {
    ...READY,
    id: 'm2',
    status: 'rejected',
    rejectReason: 'malware',
    width: null,
    height: null,
    variants: null,
  };

  it('показує файли й причини відхилення, завантажує й видаляє', async () => {
    let uploads = 0;
    let deleted = '';
    mockAdmin(OWNER);
    server.use(
      http.get(`*${API}/admin/media`, () =>
        HttpResponse.json({ items: [READY, REJECTED], nextCursor: null }),
      ),
      http.post(`*${API}/admin/media`, () => {
        uploads += 1;
        return HttpResponse.json(
          { ...READY, id: 'm3', status: 'processing', variants: null },
          { status: 202 },
        );
      }),
      http.delete(`*${API}/admin/media/:id`, ({ params }) => {
        deleted = String(params['id']);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { user } = renderAdmin('/media');

    expect(await screen.findByText('Знайдено шкідливий вміст')).toBeInTheDocument();
    expect(screen.getByText('800×600')).toBeInTheDocument();

    const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'photo.jpg', {
      type: 'image/jpeg',
    });
    await user.upload(screen.getByLabelText('Завантажити зображення'), file);
    expect(await screen.findByText('Файл прийнято, обробка триває')).toBeInTheDocument();
    expect(uploads).toBe(1);

    const cards = within(screen.getByRole('list', { name: 'Медіатека' })).getAllByRole('listitem');
    await user.click(within(cards[0] as HTMLElement).getByRole('button', { name: 'Видалити' }));
    await user.click(
      within(screen.getByRole('dialog', { name: 'Видалити файл?' })).getByRole('button', {
        name: 'Видалити',
      }),
    );
    await waitFor(() => {
      expect(deleted).toBe('m1');
    });
  });

  it('фільтр статусу потрапляє в запит', async () => {
    const queries: string[] = [];
    mockAdmin(OWNER);
    server.use(
      http.get(`*${API}/admin/media`, ({ request }) => {
        queries.push(new URL(request.url).search);
        return HttpResponse.json({ items: [], nextCursor: null });
      }),
    );
    const { user } = renderAdmin('/media');
    expect(await screen.findByText('Нічого не знайдено')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Статус'), 'rejected');
    await waitFor(() => {
      expect(queries.some((query) => query.includes('status=rejected'))).toBe(true);
    });
  });
});

describe('учасники події', () => {
  const EVENT_ID = '11111111-1111-4111-8111-111111111111';
  const EVENT = {
    id: EVENT_ID,
    slug: 'meetup',
    status: 'published',
    title: 'Meetup',
    summary: 'x',
    description: null,
    startsAt: '2030-05-01T15:00:00.000Z',
    endsAt: '2030-05-01T18:00:00.000Z',
    timezone: 'Europe/Kyiv',
    venueName: 'Хаб',
    address: null,
    onlineUrl: null,
    capacity: 50,
    coverAssetId: null,
    tags: [],
    publishedAt: null,
    version: 2,
    createdAt: '2030-01-01T00:00:00.000Z',
    updatedAt: '2030-01-01T00:00:00.000Z',
    blocks: [],
  } satisfies AdminEventDetailDto;
  const ROWS: AdminRegistrationDto[] = [
    {
      id: 'g1',
      userId: 'u5',
      displayName: 'Оля',
      status: 'registered',
      createdAt: '2030-01-02T00:00:00.000Z',
      cancelledAt: null,
      cancelReason: null,
    },
    {
      id: 'g2',
      userId: 'u6',
      displayName: 'Ігор',
      status: 'cancelled',
      createdAt: '2030-01-02T00:00:00.000Z',
      cancelledAt: '2030-01-03T00:00:00.000Z',
      cancelReason: 'self',
    },
  ];

  it('показує учасників і скасовує запис', async () => {
    let cancelled = '';
    mockAdmin(OWNER);
    server.use(
      http.get(`*${API}/admin/events/${EVENT_ID}`, () => HttpResponse.json(EVENT)),
      http.get(`*${API}/admin/events/${EVENT_ID}/registrations`, () =>
        HttpResponse.json({ items: ROWS, nextCursor: null }),
      ),
      http.post(`*${API}/admin/events/${EVENT_ID}/registrations/:id/cancel`, ({ params }) => {
        cancelled = String(params['id']);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { user } = renderAdmin(`/events/${EVENT_ID}/registrations`);

    expect(await screen.findByRole('cell', { name: 'Оля' })).toBeInTheDocument();
    expect(screen.getByText('Записано: 1 · Місць: 50')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Учасники · Meetup' })).toBeInTheDocument();

    const rows = screen.getAllByRole('button', { name: 'Скасувати запис' });
    expect(rows).toHaveLength(1);
    await user.click(rows[0] as HTMLElement);
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Скасувати запис' }),
    );
    expect(await screen.findByText('Запис скасовано')).toBeInTheDocument();
    expect(cancelled).toBe('g1');
  });
});

describe('список користувачів і безпека', () => {
  it('показує користувачів і передає фільтри в запит', async () => {
    const queries: string[] = [];
    const USERS: AdminUserDto[] = [
      {
        id: 'u2',
        displayName: 'Борис',
        status: 'blocked',
        roles: [],
        createdAt: '2030-01-01T00:00:00.000Z',
        lastLoginAt: null,
        blockedAt: '2030-01-02T00:00:00.000Z',
      },
    ];
    mockAdmin(OWNER);
    server.use(
      http.get(`*${API}/admin/users`, ({ request }) => {
        queries.push(new URL(request.url).search);
        return HttpResponse.json({ items: USERS, nextCursor: null });
      }),
    );
    const { user } = renderAdmin('/users');

    expect(await screen.findByRole('link', { name: 'Борис' })).toHaveAttribute('href', '/users/u2');
    await user.selectOptions(screen.getByLabelText('Статус'), 'blocked');
    await user.type(screen.getByLabelText(/Ім.я/), 'Бор');
    await user.tab();
    await waitFor(() => {
      expect(
        queries.some((query) => query.includes('status=blocked') && query.includes('q=')),
      ).toBe(true);
    });
  });

  it('вимикає необов’язковий MFA кодом', async () => {
    let body: unknown;
    let enabled = true;
    mockAdmin({ roles: ['editor'], permissions: ['events:read'], isOwner: false });
    server.use(
      http.get(`*${API}/auth/mfa`, () =>
        HttpResponse.json({ enabled, required: false, sessionVerified: true, stepUpUntil: null }),
      ),
      http.post(`*${API}/auth/mfa/disable`, async ({ request }) => {
        body = await request.json();
        enabled = false;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { user } = renderAdmin('/security');

    expect(await screen.findByText('Увімкнено')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Код із застосунку'), '123456');
    await user.click(screen.getByRole('button', { name: 'Вимкнути' }));
    expect(await screen.findByText('Двофакторний захист вимкнено')).toBeInTheDocument();
    expect(body).toEqual({ code: '123456' });
  });
});
