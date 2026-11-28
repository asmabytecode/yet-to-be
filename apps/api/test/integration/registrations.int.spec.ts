import {
  type AdminEventDetailDto,
  type AdminRegistrationDto,
  ERROR_CODES,
  type ListResponse,
  type MyRegistrationDto,
  type PublicEventDto,
  type PublicEventSummary,
} from '@yet-to-be/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OwnerBootstrapService } from '../../src/modules/iam';
import {
  API,
  type AuthSession,
  createTestApp,
  csrfToken,
  enableMfa,
  signUp,
  type TestApp,
} from '../test-app';

const codeOf = (body: unknown): string => (body as { code: string }).code;

const complete = {
  summary: 'Відкрита зустріч',
  venueName: 'Kyiv Hub',
  startsAt: '2030-03-01T18:00:00+01:00',
  endsAt: '2030-03-01T21:00:00+01:00',
  timezone: 'Europe/Kyiv',
};

describe('public events & registrations (integration)', () => {
  let ctx: TestApp;
  let owner: AuthSession;
  let counter = 0;
  const email = (): string => `reg${String((counter += 1))}@example.com`;

  beforeAll(async () => {
    ctx = await createTestApp();
    const ownerEmail = email();
    owner = await signUp(ctx, ownerEmail);
    await ctx.app.get(OwnerBootstrapService).grantOwner(ownerEmail);
    await enableMfa(owner);
  });
  afterAll(async () => {
    await ctx.close();
  });

  const admin = (method: 'post' | 'patch' | 'put', path: string, body?: object) =>
    owner.agent[method](`${API}/admin/events${path}`).set('X-CSRF-Token', owner.csrf).send(body);

  /** Створює й (за замовчуванням) публікує подію. */
  async function event(fields: object = {}, publish = true): Promise<AdminEventDetailDto> {
    const created = (
      await admin('post', '', { title: 'Подія для запису', ...complete, ...fields }).expect(201)
    ).body as AdminEventDetailDto;
    if (!publish) return created;
    await admin('post', `/${created.id}/transition`, { action: 'publish', version: 1 }).expect(200);
    return { ...created, status: 'published', version: 2 };
  }

  async function member(): Promise<{ session: AuthSession; id: string }> {
    const session = await signUp(ctx, email());
    return { session, id: (session.res.body as { user: { id: string } }).user.id };
  }

  const register = (session: AuthSession, eventId: string) =>
    session.agent.post(`${API}/events/${eventId}/registrations`).set('X-CSRF-Token', session.csrf);
  const cancelOwn = (session: AuthSession, eventId: string) =>
    session.agent
      .delete(`${API}/events/${eventId}/registrations/me`)
      .set('X-CSRF-Token', session.csrf);

  describe('public pages', () => {
    it('shows only published events, cacheable and without internal fields', async () => {
      const draft = await event({ title: 'Таємна чернетка' }, false);
      const live = await event({ title: 'Публічна подія', tags: ['open'], capacity: 10 });
      const guest = ctx.agent();

      const list = await guest.get(`${API}/events`).query({ tag: 'open' }).expect(200);
      expect(list.headers['cache-control']).toBe('public, max-age=0, s-maxage=60');
      const items = (list.body as ListResponse<PublicEventSummary>).items;
      expect(items.map((item) => item.slug)).toEqual([live.slug]);

      const page = await guest.get(`${API}/events/${live.slug}`).expect(200);
      const dto = page.body as PublicEventDto;
      expect(dto).toMatchObject({
        status: 'published',
        spotsLeft: 10,
        registrationOpen: true,
        cover: null,
      });
      expect(dto).not.toHaveProperty('createdById');
      expect(dto).not.toHaveProperty('version');

      await guest.get(`${API}/events/${draft.slug}`).expect(404);
      await guest.get(`${API}/events/Not_A_Slug`).expect(400);
      await guest.get(`${API}/events`).query({ status: 'draft' }).expect(400);
    });
  });

  describe('registration', () => {
    it('requires a session, is idempotent and frees the spot on cancel', async () => {
      const target = await event({ title: 'Запис і скасування', capacity: 3 });
      // Токен — до створення POST: agent підставляє cookies у момент створення запиту.
      const guest = ctx.agent();
      const guestCsrf = await csrfToken(guest);
      await guest
        .post(`${API}/events/${target.id}/registrations`)
        .set('X-CSRF-Token', guestCsrf)
        .expect(401);

      const { session } = await member();
      const first = (await register(session, target.id).expect(201)).body as MyRegistrationDto;
      const again = (await register(session, target.id).expect(201)).body as MyRegistrationDto;
      expect(again.id).toBe(first.id);
      expect(first.event.slug).toBe(target.slug);

      const page = (await ctx.agent().get(`${API}/events/${target.slug}`).expect(200))
        .body as PublicEventDto;
      expect(page.spotsLeft).toBe(2);
      const mine = (await session.agent.get(`${API}/users/me/registrations`).expect(200))
        .body as ListResponse<MyRegistrationDto>;
      expect(mine.items.map((item) => item.event.id)).toEqual([target.id]);

      await cancelOwn(session, target.id).expect(204);
      await cancelOwn(session, target.id).expect(204);
      const after = (await ctx.agent().get(`${API}/events/${target.slug}`).expect(200))
        .body as PublicEventDto;
      expect(after.spotsLeft).toBe(3);
      const empty = (await session.agent.get(`${API}/users/me/registrations`).expect(200))
        .body as ListResponse<MyRegistrationDto>;
      expect(empty.items).toEqual([]);

      // Повторний запис після скасування використовує той самий рядок.
      expect(((await register(session, target.id).expect(201)).body as MyRegistrationDto).id).toBe(
        first.id,
      );
    });

    it('never oversells the last spots under concurrent requests', async () => {
      const target = await event({ title: 'Гонка за місця', capacity: 2 });
      const members = await Promise.all(Array.from({ length: 5 }, () => member()));
      const results = await Promise.all(members.map(({ session }) => register(session, target.id)));

      expect(results.filter((res) => res.status === 201)).toHaveLength(2);
      const rejected = results.filter((res) => res.status !== 201);
      expect(rejected).toHaveLength(3);
      for (const res of rejected) {
        expect(res.status).toBe(409);
        expect(codeOf(res.body)).toBe(ERROR_CODES.EVENT_FULL);
      }
      const row = await ctx.db.prisma.event.findUniqueOrThrow({ where: { id: target.id } });
      expect(row.registeredCount).toBe(2);
      expect(
        await ctx.db.prisma.eventRegistration.count({
          where: { eventId: target.id, status: 'registered' },
        }),
      ).toBe(2);
    });

    it('is closed for drafts and for events that already started', async () => {
      const { session } = await member();
      const draft = await event({ title: 'Ще чернетка' }, false);
      await register(session, draft.id).expect(404);

      const started = await event({ title: 'Уже триває', startsAt: '2020-01-01T10:00:00Z' });
      const res = await register(session, started.id).expect(409);
      expect(codeOf(res.body)).toBe(ERROR_CODES.REGISTRATION_CLOSED);
      const page = (await ctx.agent().get(`${API}/events/${started.slug}`).expect(200))
        .body as PublicEventDto;
      expect(page.registrationOpen).toBe(false);
    });

    it('does not let editors shrink capacity below current registrations', async () => {
      const target = await event({ title: 'Місткість', capacity: 5 });
      for (const { session } of await Promise.all([member(), member()])) {
        await register(session, target.id).expect(201);
      }
      const res = await admin('patch', `/${target.id}`, { version: 2, capacity: 1 }).expect(400);
      expect(codeOf(res.body)).toBe(ERROR_CODES.VALIDATION_FAILED);
      await admin('patch', `/${target.id}`, { version: 2, capacity: 2 }).expect(200);
    });
  });

  describe('admin', () => {
    it('lists participants and cancels a registration with an audit entry', async () => {
      const target = await event({ title: 'Учасники' });
      const { session } = await member();
      const reg = (await register(session, target.id).expect(201)).body as MyRegistrationDto;

      const list = (
        await owner.agent.get(`${API}/admin/events/${target.id}/registrations`).expect(200)
      ).body as ListResponse<AdminRegistrationDto>;
      expect(list.items).toEqual([
        expect.objectContaining({ id: reg.id, displayName: 'Ada', status: 'registered' }),
      ]);
      await session.agent.get(`${API}/admin/events/${target.id}/registrations`).expect(403);

      await admin('post', `/${target.id}/registrations/${reg.id}/cancel`).expect(204);
      const after = (
        await owner.agent
          .get(`${API}/admin/events/${target.id}/registrations`)
          .query({ status: 'cancelled' })
          .expect(200)
      ).body as ListResponse<AdminRegistrationDto>;
      expect(after.items[0]).toMatchObject({ status: 'cancelled', cancelReason: 'admin' });
      expect(
        await ctx.db.prisma.auditLog.count({
          where: { action: 'admin.registration.cancel', targetId: reg.id },
        }),
      ).toBe(1);

      const other = await event({ title: 'Інша подія' });
      await admin('post', `/${other.id}/registrations/${reg.id}/cancel`).expect(404);
    });

    it('cancels upcoming registrations of a blocked user', async () => {
      const target = await event({ title: 'Блокування', capacity: 5 });
      const { session, id } = await member();
      await register(session, target.id).expect(201);

      await owner.agent
        .post(`${API}/admin/users/${id}/block`)
        .set('X-CSRF-Token', owner.csrf)
        .send({ reason: 'Спам у коментарях' })
        .expect(204);

      const row = await ctx.db.prisma.eventRegistration.findFirstOrThrow({
        where: { eventId: target.id, userId: id },
      });
      expect(row).toMatchObject({ status: 'cancelled', cancelReason: 'user_blocked' });
      const page = (await ctx.agent().get(`${API}/events/${target.slug}`).expect(200))
        .body as PublicEventDto;
      expect(page.spotsLeft).toBe(5);
    });
  });
});
