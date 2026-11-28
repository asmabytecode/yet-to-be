import { ERROR_CODES, type MediaAssetDto } from '@yet-to-be/shared';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { MediaUsageRegistry } from '../../src/platform/media-usage';
import { JobQueue } from '../../src/platform/job-queue';
import { ADMIN_ROLE_ID, OwnerBootstrapService } from '../../src/modules/iam';
import { EICAR, type InMemoryObjectStorage, OBJECT_STORAGE } from '../../src/modules/media';
import { API, type AuthSession, createTestApp, enableMfa, signUp, type TestApp } from '../test-app';

// Малі ліміти, щоб перевірити відмови без гігантських файлів. До імпорту AppModule.
vi.hoisted(() => {
  process.env.MEDIA_MAX_BYTES = '300000';
  process.env.MEDIA_MAX_PIXELS = '1000000';
});

const codeOf = (body: unknown): string => (body as { code: string }).code;
const solid = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: { r: 10, g: 120, b: 200 } } });

describe('media pipeline (integration)', () => {
  let ctx: TestApp;
  let editor: AuthSession;
  let storage: InMemoryObjectStorage;
  let counter = 0;
  const email = (): string => `media${String((counter += 1))}@example.com`;

  beforeAll(async () => {
    ctx = await createTestApp();
    storage = ctx.app.get<InMemoryObjectStorage>(OBJECT_STORAGE);
    const ownerEmail = email();
    const owner = await signUp(ctx, ownerEmail);
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

  const upload = (session: AuthSession, data: Buffer, filename = 'photo.png', type = 'image/png') =>
    session.agent
      .post(`${API}/admin/media`)
      .set('X-CSRF-Token', session.csrf)
      .attach('file', data, { filename, contentType: type });

  async function settled(id: string): Promise<MediaAssetDto> {
    await ctx.app.get(JobQueue).drain();
    return (await editor.agent.get(`${API}/admin/media/${id}`).expect(200)).body as MediaAssetDto;
  }

  function stored(prefix: string): Buffer[] {
    return [...storage.objects.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .map(([, value]) => value.body);
  }

  it('accepts an image, re-encodes it into webp variants and empties the quarantine', async () => {
    const res = await upload(editor, await solid(800, 400).png().toBuffer());
    // Тіло відповіді в повідомленні — щоб одразу бачити причину, якщо завантаження відхилено.
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const created = res.body as MediaAssetDto;
    expect(created.status).toBe('processing');

    const asset = await settled(created.id);
    expect(asset).toMatchObject({ status: 'ready', width: 800, height: 400, rejectReason: null });
    expect(Object.keys(asset.variants ?? {}).sort()).toEqual(['lg', 'md', 'thumb']);
    expect(asset.variants?.thumb).toMatch(
      new RegExp(`^/media/${created.id}/thumb-[0-9a-f]{12}\\.webp$`),
    );

    expect(stored(`ytb-quarantine/${created.id}`)).toHaveLength(0);
    const variants = stored(`ytb-media/${created.id}/`);
    expect(variants).toHaveLength(3);
    const entry = [...storage.objects.values()].find((value) => value.body === variants[0]);
    expect(entry?.options).toEqual({
      contentType: 'image/webp',
      cacheControl: 'public, max-age=31536000, immutable',
    });
  });

  it.each([
    ['HTML disguised as PNG', Buffer.from('<html><script>alert(1)</script></html>'), 'x.png'],
    [
      'SVG with a script',
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'),
      'x.svg',
    ],
    ['GIF', Buffer.from('GIF89a\u0001\u0000\u0001\u0000\u0000\u0000\u0000;', 'latin1'), 'x.gif'],
    ['PDF', Buffer.from('%PDF-1.7\n%âãÏÓ'), 'x.pdf'],
  ])('rejects %s by its content with 415', async (_name, data, filename) => {
    const res = await upload(editor, data, filename).expect(415);
    expect(codeOf(res.body)).toBe(ERROR_CODES.MEDIA_UNSUPPORTED_TYPE);
  });

  it('rejects a path-traversal file name harmlessly: the name is never used', async () => {
    const res = await upload(
      editor,
      await solid(10, 10).png().toBuffer(),
      '../../etc/passwd.png',
    ).expect(201);
    const { id } = res.body as MediaAssetDto;
    expect([...storage.objects.keys()].some((key) => key.includes('passwd'))).toBe(false);
    expect((await settled(id)).status).toBe('ready');
  });

  it('flags malware via the scanner (EICAR) and keeps nothing', async () => {
    const infected = Buffer.concat([await solid(16, 16).png().toBuffer(), Buffer.from(EICAR)]);
    const { id } = (await upload(editor, infected).expect(201)).body as MediaAssetDto;
    expect(await settled(id)).toMatchObject({
      status: 'rejected',
      rejectReason: 'malware',
      variants: null,
    });
    expect(stored(`ytb-quarantine/${id}`)).toHaveLength(0);
    expect(stored(`ytb-media/${id}/`)).toHaveLength(0);
  });

  it('rejects pixel bombs and corrupt images after upload', async () => {
    const bomb = await solid(1200, 1000).png({ compressionLevel: 9 }).toBuffer();
    const bombId = ((await upload(editor, bomb).expect(201)).body as MediaAssetDto).id;
    expect((await settled(bombId)).rejectReason).toBe('too_many_pixels');

    const truncated = (await solid(64, 64).png().toBuffer()).subarray(0, 60);
    const brokenId = ((await upload(editor, truncated).expect(201)).body as MediaAssetDto).id;
    expect((await settled(brokenId)).rejectReason).toBe('invalid_image');
  });

  it('strips EXIF/GPS and smuggled HTML from what it publishes', async () => {
    const tricky = Buffer.concat([
      await solid(40, 40)
        .jpeg()
        .withExif({ IFD0: { Copyright: 'gps-owner-secret' } })
        .toBuffer(),
      Buffer.from('<script>alert(1)</script>'),
    ]);
    const { id } = (await upload(editor, tricky, 'x.jpg', 'image/jpeg').expect(201))
      .body as MediaAssetDto;
    expect((await settled(id)).status).toBe('ready');
    for (const body of stored(`ytb-media/${id}/`)) {
      expect(body.includes('gps-owner-secret')).toBe(false);
      expect(body.includes('<script>')).toBe(false);
    }
  });

  it('enforces size and form shape', async () => {
    const tooBig = Buffer.concat([await solid(10, 10).png().toBuffer(), Buffer.alloc(310_000)]);
    const big = await upload(editor, tooBig).expect(413);
    expect(codeOf(big.body)).toBe(ERROR_CODES.PAYLOAD_TOO_LARGE);

    const png = await solid(10, 10).png().toBuffer();
    await editor.agent
      .post(`${API}/admin/media`)
      .set('X-CSRF-Token', editor.csrf)
      .attach('image', png, 'a.png')
      .expect(400);
    await editor.agent
      .post(`${API}/admin/media`)
      .set('X-CSRF-Token', editor.csrf)
      .attach('file', png, 'a.png')
      .attach('file', png, 'b.png')
      .expect(400);
    await editor.agent
      .post(`${API}/admin/media`)
      .set('X-CSRF-Token', editor.csrf)
      .field('note', 'hi')
      .attach('file', png, 'a.png')
      .expect(400);
    await editor.agent
      .post(`${API}/admin/media`)
      .set('X-CSRF-Token', editor.csrf)
      .send({ file: 'not multipart' })
      .expect(400);
  });

  it('requires media:write and a CSRF token', async () => {
    const regular = await signUp(ctx, email());
    await upload(regular, await solid(10, 10).png().toBuffer()).expect(403);
    await editor.agent
      .post(`${API}/admin/media`)
      .attach('file', await solid(10, 10).png().toBuffer(), 'a.png')
      .expect(403);
  });

  it('refuses to delete media in use, then deletes and purges the files', async () => {
    const { id } = (await upload(editor, await solid(20, 20).png().toBuffer()).expect(201))
      .body as MediaAssetDto;
    await settled(id);
    let inUse = true;
    ctx.app.get(MediaUsageRegistry).register((assetId) => Promise.resolve(assetId === id && inUse));

    const blocked = await editor.agent
      .delete(`${API}/admin/media/${id}`)
      .set('X-CSRF-Token', editor.csrf)
      .expect(409);
    expect(codeOf(blocked.body)).toBe(ERROR_CODES.MEDIA_IN_USE);

    inUse = false;
    await editor.agent
      .delete(`${API}/admin/media/${id}`)
      .set('X-CSRF-Token', editor.csrf)
      .expect(204);
    await ctx.app.get(JobQueue).drain();
    expect(stored(`ytb-media/${id}/`)).toHaveLength(0);
    await editor.agent.get(`${API}/admin/media/${id}`).expect(404);
  });

  it('enforces the daily quota and audits uploads', async () => {
    const user = await ctx.db.prisma.user.findFirstOrThrow({
      where: { roles: { some: { roleId: ADMIN_ROLE_ID } } },
    });
    await ctx.db.prisma.mediaAsset.createMany({
      data: Array.from({ length: 100 }, (_, i) => ({
        uploadedById: user.id,
        originalSha256: `x${String(i)}`,
        originalSize: 1,
      })),
    });
    const res = await upload(editor, await solid(10, 10).png().toBuffer()).expect(429);
    expect(codeOf(res.body)).toBe(ERROR_CODES.MEDIA_QUOTA_EXCEEDED);

    const audit = await ctx.db.prisma.auditLog.findMany({
      where: { action: { in: ['admin.media.upload', 'media.rejected', 'admin.media.delete'] } },
    });
    expect(new Set(audit.map((row) => row.action))).toEqual(
      new Set(['admin.media.upload', 'media.rejected', 'admin.media.delete']),
    );
    expect(audit.some((row) => (row.metadata ?? '').includes('passwd'))).toBe(false);
  });
});
