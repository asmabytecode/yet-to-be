import {
  type AdminEventDetailDto,
  type AdminEventDto,
  ERROR_CODES,
  type ListResponse,
  type MediaAssetDto,
} from '@yet-to-be/shared';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN_ROLE_ID, OwnerBootstrapService } from '../../src/modules/iam';
import { JobQueue } from '../../src/platform/job-queue';
import {
  API,
  type AuthSession,
  createTestApp,
  enableMfa,
  signUp,
  stepUp,
  type TestApp,
} from '../test-app';

const codeOf = (body: unknown): string => (body as { code: string }).code;

const base = {
  title: 'Мітап про безпеку',
  startsAt: '2030-03-01T18:00:00+01:00',
  endsAt: '2030-03-01T21:00:00+01:00',
  timezone: 'Europe/Warsaw',
};

describe('admin events API (integration)', () => {
  let ctx: TestApp;
  let owner: AuthSession;
  let editor: AuthSession;
  let counter = 0;
  const email = (): string => `ev${String((counter += 1))}@example.com`;

  beforeAll(async () => {
    ctx = await createTestApp();
    const ownerEmail = email();
    owner = await signUp(ctx, ownerEmail);
    await ctx.app.get(OwnerBootstrapService).grantOwner(ownerEmail);
    await enableMfa(owner);
    const editorEmail = email();
    editor = await signUp(ctx, editorEmail);
    await owner.agent
      .post(`${API}/admin/members`)
      .set('X-CSRF-Token', owner.csrf)
      .send({ email: editorEmail, roleId: ADMIN_ROLE_ID })
      .expect(204);
  });
  afterAll(async () => {
    await ctx.close();
  });

  const send = (
    session: AuthSession,
    method: 'post' | 'patch' | 'put' | 'delete',
    path: string,
    body?: object,
  ) =>
    session.agent[method](`${API}/admin/events${path}`)
      .set('X-CSRF-Token', session.csrf)
      .send(body);

  async function create(body: object = base): Promise<AdminEventDetailDto> {
    return (await send(editor, 'post', '', body).expect(201)).body as AdminEventDetailDto;
  }

  describe('create', () => {
    it('creates a draft with a transliterated, unique slug', async () => {
      const first = await create();
      expect(first).toMatchObject({
        status: 'draft',
        version: 1,
        slug: 'mitap-pro-bezpeku',
        tags: [],
        blocks: [],
      });
      expect((await create()).slug).toBe('mitap-pro-bezpeku-2');
    });

    it('is idempotent with the same Idempotency-Key', async () => {
      const key = 'create-key-0001';
      const a = await send(editor, 'post', '', { ...base, title: 'Ідемпотентність' })
        .set('Idempotency-Key', key)
        .expect(201);
      const b = await send(editor, 'post', '', { ...base, title: 'Ідемпотентність' })
        .set('Idempotency-Key', key)
        .expect(201);
      expect((a.body as AdminEventDto).id).toBe((b.body as AdminEventDto).id);
      await send(editor, 'post', '', base).set('Idempotency-Key', 'bad key!').expect(400);
    });

    it.each([
      ['end before start', { ...base, endsAt: '2030-03-01T17:00:00+01:00' }],
      ['javascript: link', { ...base, onlineUrl: 'javascript:alert(1)' }],
      ['unknown time zone', { ...base, timezone: 'Mars/Base' }],
      ['bidi override in the title', { ...base, title: 'Mee\u202Etup' }],
      ['server-controlled field', { ...base, status: 'published' }],
      ['too many tags', { ...base, tags: Array.from({ length: 11 }, (_, i) => `t${String(i)}`) }],
    ])('rejects %s with 400', async (_name, body) => {
      const res = await send(editor, 'post', '', body).expect(400);
      expect(codeOf(res.body)).toBe(ERROR_CODES.VALIDATION_FAILED);
    });
  });

  describe('update with optimistic locking', () => {
    it('applies a change once and rejects a stale version', async () => {
      const event = await create({ ...base, title: 'Версії' });
      const ok = await send(editor, 'patch', `/${event.id}`, {
        version: 1,
        summary: 'Опис',
      }).expect(200);
      expect(ok.body as AdminEventDto).toMatchObject({ version: 2, summary: 'Опис' });

      const stale = await send(editor, 'patch', `/${event.id}`, {
        version: 1,
        title: 'Чужа правка',
      }).expect(409);
      expect(codeOf(stale.body)).toBe(ERROR_CODES.EVENT_VERSION_CONFLICT);
      const invalid = await send(editor, 'patch', `/${event.id}`, {
        version: 2,
        endsAt: '2030-03-01T10:00:00+01:00',
      }).expect(400);
      expect(codeOf(invalid.body)).toBe(ERROR_CODES.VALIDATION_FAILED);
    });
  });

  describe('content blocks', () => {
    it('replaces the ordered list of typed blocks', async () => {
      const event = await create({ ...base, title: 'Блоки' });
      const blocks = [
        { type: 'text', data: { body: '## Про подію\nКороткий опис' } },
        { type: 'agenda_item', data: { time: '18:00', title: 'Відкриття' } },
        { type: 'speaker', data: { name: 'Ada Lovelace', role: 'Спікерка' } },
        { type: 'link', data: { label: 'Трансляція', url: 'https://stream.example.com/live' } },
      ];
      const res = await send(editor, 'put', `/${event.id}/blocks`, { version: 1, blocks }).expect(
        200,
      );
      const detail = res.body as AdminEventDetailDto;
      expect(detail.version).toBe(2);
      expect(detail.blocks.map((block) => block.type)).toEqual([
        'text',
        'agenda_item',
        'speaker',
        'link',
      ]);

      const reordered = [blocks[3], blocks[0]];
      const again = (
        await send(editor, 'put', `/${event.id}/blocks`, { version: 2, blocks: reordered }).expect(
          200,
        )
      ).body as AdminEventDetailDto;
      expect(again.blocks.map((block) => block.type)).toEqual(['link', 'text']);

      await send(editor, 'put', `/${event.id}/blocks`, {
        version: 3,
        blocks: [{ type: 'html', data: { raw: '<b>' } }],
      }).expect(400);
      await send(editor, 'put', `/${event.id}/blocks`, { version: 1, blocks: [] }).expect(409);
      const missingPhoto = await send(editor, 'put', `/${event.id}/blocks`, {
        version: 3,
        blocks: [
          {
            type: 'speaker',
            data: { name: 'X', photoAssetId: '00000000-0000-4000-8000-0000000000aa' },
          },
        ],
      }).expect(409);
      expect(codeOf(missingPhoto.body)).toBe(ERROR_CODES.MEDIA_NOT_READY);
    });
  });

  describe('lifecycle', () => {
    it('publishes only complete events and follows the state machine', async () => {
      const event = await create({ ...base, title: 'Життєвий цикл' });
      const incomplete = await send(editor, 'post', `/${event.id}/transition`, {
        action: 'publish',
        version: 1,
      }).expect(409);
      expect(codeOf(incomplete.body)).toBe(ERROR_CODES.EVENT_INCOMPLETE);
      expect(
        (incomplete.body as { issues: { path: string }[] }).issues.map((i) => i.path).sort(),
      ).toEqual(['summary', 'venueName']);

      await send(editor, 'patch', `/${event.id}`, {
        version: 1,
        summary: 'Про безпеку',
        venueName: 'Kyiv Hub',
      }).expect(200);
      const published = (
        await send(editor, 'post', `/${event.id}/transition`, {
          action: 'publish',
          version: 2,
        }).expect(200)
      ).body as AdminEventDto;
      expect(published.status).toBe('published');
      expect(published.publishedAt).not.toBeNull();

      const twice = await send(editor, 'post', `/${event.id}/transition`, {
        action: 'publish',
        version: 3,
      }).expect(409);
      expect(codeOf(twice.body)).toBe(ERROR_CODES.EVENT_INVALID_TRANSITION);
      await stepUp(editor);
      await send(editor, 'delete', `/${event.id}`).expect(409);

      await send(editor, 'post', `/${event.id}/transition`, {
        action: 'cancel',
        version: 3,
      }).expect(200);
      await send(editor, 'post', `/${event.id}/transition`, {
        action: 'archive',
        version: 4,
      }).expect(200);
      await send(editor, 'post', `/${event.id}/transition`, {
        action: 'publish',
        version: 5,
      }).expect(409);
    });

    it('deletes softly and only after a fresh step-up', async () => {
      const event = await create({ ...base, title: 'Видалення' });
      await ctx.db.prisma.session.updateMany({ data: { stepUpAt: null } });
      const stale = await send(editor, 'delete', `/${event.id}`).expect(403);
      expect(codeOf(stale.body)).toBe(ERROR_CODES.REAUTH_REQUIRED);
      await stepUp(editor);
      await send(editor, 'delete', `/${event.id}`).expect(204);
      await editor.agent.get(`${API}/admin/events/${event.id}`).expect(404);
      expect(await ctx.db.prisma.event.count({ where: { id: event.id } })).toBe(1);
    });

    it('duplicates an event with its blocks as a new draft', async () => {
      const event = await create({ ...base, title: 'Оригінал' });
      await send(editor, 'put', `/${event.id}/blocks`, {
        version: 1,
        blocks: [{ type: 'text', data: { body: 'Текст' } }],
      }).expect(200);
      const copy = (await send(editor, 'post', `/${event.id}/duplicate`).expect(201))
        .body as AdminEventDetailDto;
      expect(copy).toMatchObject({ status: 'draft', version: 1, title: 'Оригінал (копія)' });
      expect(copy.id).not.toBe(event.id);
      expect(copy.blocks).toHaveLength(1);
    });
  });

  describe('listing', () => {
    it('filters, sorts and paginates with allowlisted parameters', async () => {
      await create({ ...base, title: 'Тегована подія', tags: ['security', 'kyiv'] });
      const tagged = (await editor.agent.get(`${API}/admin/events?tag=kyiv`).expect(200))
        .body as ListResponse<AdminEventDto>;
      expect(tagged.items.map((item) => item.title)).toEqual(['Тегована подія']);

      const page = (
        await editor.agent.get(`${API}/admin/events?limit=2&sort=createdAt`).expect(200)
      ).body as ListResponse<AdminEventDto>;
      expect(page.items).toHaveLength(2);
      expect(page.nextCursor).not.toBeNull();

      const drafts = (
        await editor.agent
          .get(`${API}/admin/events?status=draft&q=${encodeURIComponent('Версії')}`)
          .expect(200)
      ).body as ListResponse<AdminEventDto>;
      expect(drafts.items.every((item) => item.status === 'draft')).toBe(true);

      await editor.agent.get(`${API}/admin/events?sort=passwordHash`).expect(400);
      await editor.agent.get(`${API}/admin/events?status=deleted`).expect(400);
    });

    it('requires events permissions', async () => {
      const regular = await signUp(ctx, email());
      await regular.agent.get(`${API}/admin/events`).expect(403);
      await send(regular, 'post', '', base).expect(403);
    });
  });

  describe('media references', () => {
    it('uses only ready media and protects it from deletion while referenced', async () => {
      const png = await sharp({
        create: { width: 64, height: 32, channels: 3, background: '#123456' },
      })
        .png()
        .toBuffer();
      const uploaded = (
        await editor.agent
          .post(`${API}/admin/media`)
          .set('X-CSRF-Token', editor.csrf)
          .attach('file', png, 'cover.png')
          .expect(201)
      ).body as MediaAssetDto;
      const early = await send(editor, 'post', '', {
        ...base,
        title: 'Обкладинка',
        coverAssetId: uploaded.id,
      });
      // Залежно від швидкості обробки файл може бути ще не готовий.
      if (early.status === 409) expect(codeOf(early.body)).toBe(ERROR_CODES.MEDIA_NOT_READY);
      await ctx.app.get(JobQueue).drain();

      const event = await create({ ...base, title: 'З обкладинкою', coverAssetId: uploaded.id });
      expect(event.coverAssetId).toBe(uploaded.id);
      const inUse = await editor.agent
        .delete(`${API}/admin/media/${uploaded.id}`)
        .set('X-CSRF-Token', editor.csrf)
        .expect(409);
      expect(codeOf(inUse.body)).toBe(ERROR_CODES.MEDIA_IN_USE);
    });
  });

  it('writes every change to the audit log', async () => {
    const actions = new Set(
      (await ctx.db.prisma.auditLog.findMany({ where: { targetType: 'event' } })).map(
        (row) => row.action,
      ),
    );
    for (const action of [
      'admin.event.create',
      'admin.event.update',
      'admin.event.blocks_replace',
      'admin.event.transition',
      'admin.event.duplicate',
      'admin.event.delete',
    ]) {
      expect(actions).toContain(action);
    }
  });
});
