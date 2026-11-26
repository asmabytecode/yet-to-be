import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { RecordNotFoundError, UniqueConstraintError } from '../errors';
import { clearDatabase, createTestDatabase, type TestDatabase } from '../test-database.fixture';
import { SessionsRepository, type CreateSessionInput } from './sessions.repository';
import { UsersRepository } from './users.repository';

describe('SessionsRepository', () => {
  let db: TestDatabase;
  let sessions: SessionsRepository;
  let userId: string;

  const now = new Date('2026-06-01T12:00:00.000Z');
  const inFuture = new Date('2026-07-01T12:00:00.000Z');

  const input = (hash: string, overrides: Partial<CreateSessionInput> = {}): CreateSessionInput => ({
    userId,
    familyId: 'family-1',
    refreshTokenHash: hash,
    expiresAt: inFuture,
    userAgent: 'vitest',
    ipHash: 'iphash',
    ...overrides,
  });

  beforeAll(async () => {
    db = await createTestDatabase();
    sessions = new SessionsRepository(db.prisma);
  });

  afterAll(async () => {
    await db.cleanup();
  });

  beforeEach(async () => {
    await clearDatabase(db.prisma);
    const user = await new UsersRepository(db.prisma).create({
      emailEncrypted: 'enc',
      emailBlindIndex: 'blind',
      passwordHash: 'hash',
      displayNameEncrypted: null,
    });
    userId = user.id;
  });

  it('creates a session and finds it by token hash', async () => {
    const created = await sessions.create(input('tok-1'));
    expect(created.revokedAt).toBeNull();
    expect((await sessions.findByTokenHash('tok-1'))?.id).toBe(created.id);
    expect(await sessions.findByTokenHash('unknown')).toBeNull();
  });

  it('rejects a duplicate token hash', async () => {
    await sessions.create(input('tok-dup'));
    await expect(sessions.create(input('tok-dup'))).rejects.toBeInstanceOf(UniqueConstraintError);
  });

  it('rotates a session: new one is active, old one is revoked and linked', async () => {
    const first = await sessions.create(input('tok-a'));
    const second = await sessions.rotate(first.id, input('tok-b'), now);

    const oldRow = await sessions.findByTokenHash('tok-a');
    expect(oldRow?.revokedAt?.toISOString()).toBe(now.toISOString());
    expect(oldRow?.replacedById).toBe(second.id);
    expect(second.familyId).toBe(first.familyId);
    expect((await sessions.listActiveForUser(userId, now)).map((s) => s.id)).toEqual([second.id]);
  });

  it('rolls back rotation when the old session does not exist', async () => {
    await expect(sessions.rotate('missing', input('tok-new'), now)).rejects.toBeInstanceOf(
      RecordNotFoundError,
    );
    expect(await sessions.findByTokenHash('tok-new')).toBeNull();
  });

  it('revokes a single session only once', async () => {
    const created = await sessions.create(input('tok-r'));
    expect(await sessions.revoke(created.id, now)).toBe(true);
    expect(await sessions.revoke(created.id, now)).toBe(false);
  });

  it('revokes a whole family without touching other families', async () => {
    await sessions.create(input('f1-a'));
    await sessions.create(input('f1-b'));
    const other = await sessions.create(input('f2-a', { familyId: 'family-2' }));

    expect(await sessions.revokeFamily('family-1', now)).toBe(2);
    expect((await sessions.listActiveForUser(userId, now)).map((s) => s.id)).toEqual([other.id]);
  });

  it('revokes all sessions of a user', async () => {
    await sessions.create(input('u-a'));
    await sessions.create(input('u-b', { familyId: 'family-2' }));
    expect(await sessions.revokeAllForUser(userId, now)).toBe(2);
    expect(await sessions.listActiveForUser(userId, now)).toEqual([]);
  });

  it('lists only active, non-expired sessions', async () => {
    await sessions.create(input('active'));
    await sessions.create(input('expired', { expiresAt: new Date('2026-05-01T00:00:00.000Z') }));
    const revoked = await sessions.create(input('revoked'));
    await sessions.revoke(revoked.id, now);

    const active = await sessions.listActiveForUser(userId, now);
    expect(active).toHaveLength(1);
    expect(active[0]?.refreshTokenHash).toBe('active');
  });

  it('deletes expired sessions', async () => {
    await sessions.create(input('keep'));
    await sessions.create(input('drop', { expiresAt: new Date('2026-05-01T00:00:00.000Z') }));
    expect(await sessions.deleteExpired(now)).toBe(1);
    expect(await sessions.findByTokenHash('drop')).toBeNull();
    expect(await sessions.findByTokenHash('keep')).not.toBeNull();
  });
});
