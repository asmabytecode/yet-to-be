import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { RecordNotFoundError, UniqueConstraintError } from '../errors';
import {
  clearDatabase,
  createTestDatabase,
  makeUserInput,
  type TestDatabase,
} from '../test-database.fixture';
import { AuditLogRepository } from './audit-log.repository';
import { SessionsRepository } from './sessions.repository';
import { UsersRepository } from './users.repository';

describe('UsersRepository', () => {
  let db: TestDatabase;
  let users: UsersRepository;

  const newUser = (suffix: string) => makeUserInput(suffix);

  beforeAll(async () => {
    db = await createTestDatabase();
    users = new UsersRepository(db.prisma);
  });

  afterAll(async () => {
    await db.cleanup();
  });

  beforeEach(async () => {
    await clearDatabase(db.prisma);
  });

  it('creates a user with defaults and finds it by id and blind index', async () => {
    const created = await users.create(newUser('a'));
    expect(created.role).toBe('user');
    expect(created.emailVerifiedAt).toBeNull();
    expect((await users.findById(created.id))?.id).toBe(created.id);
    expect((await users.findByEmailBlindIndex('blind-a'))?.id).toBe(created.id);
  });

  it('returns null for unknown users', async () => {
    expect(await users.findById('nope')).toBeNull();
    expect(await users.findByEmailBlindIndex('nope')).toBeNull();
  });

  it('allows a user without password (Google-only account)', async () => {
    const created = await users.create({ ...newUser('g'), passwordHash: null });
    expect(created.passwordHash).toBeNull();
  });

  it('rejects a duplicate email blind index', async () => {
    await users.create(newUser('dup'));
    await expect(users.create(newUser('dup'))).rejects.toBeInstanceOf(UniqueConstraintError);
  });

  it('updates profile fields', async () => {
    const created = await users.create(newUser('u'));
    const renamed = await users.updateDisplayName(created.id, 'New Name');
    expect(renamed.displayName).toBe('New Name');
  });

  it('creates a user together with a session atomically', async () => {
    const input = newUser('cws');
    const { user, session } = await users.createWithSession(input, {
      familyId: 'fam-cws',
      refreshTokenHash: 'tok-cws',
      expiresAt: new Date(Date.now() + 60_000),
      userAgent: null,
      ipHash: null,
    });
    expect(session.userId).toBe(user.id);
    expect(user.id).toBe(input.id);
  });

  it('rolls back the user when the session cannot be created', async () => {
    const sessions = new SessionsRepository(db.prisma);
    const owner = await users.create(newUser('owner'));
    await sessions.create({
      userId: owner.id,
      familyId: 'fam-1',
      refreshTokenHash: 'tok-taken',
      expiresAt: new Date(Date.now() + 60_000),
      userAgent: null,
      ipHash: null,
    });

    await expect(
      users.createWithSession(newUser('rollback'), {
        familyId: 'fam-2',
        refreshTokenHash: 'tok-taken',
        expiresAt: new Date(Date.now() + 60_000),
        userAgent: null,
        ipHash: null,
      }),
    ).rejects.toThrow();
    expect(await users.findByEmailBlindIndex('blind-rollback')).toBeNull();
  });

  it('tracks and resets login failures', async () => {
    const created = await users.create(newUser('lf'));
    const until = new Date('2026-06-01T12:15:00.000Z');
    const locked = await users.recordLoginFailure(created.id, 5, until);
    expect(locked.failedLogins).toBe(5);
    expect(locked.lockedUntil?.toISOString()).toBe(until.toISOString());

    const reset = await users.resetLoginFailures(created.id);
    expect(reset.failedLogins).toBe(0);
    expect(reset.lockedUntil).toBeNull();
  });

  it('resets email verification when the email changes', async () => {
    const created = await users.create(newUser('e'));
    await users.markEmailVerified(created.id, new Date());
    const changed = await users.updateEmail(created.id, 'enc-email-new', 'blind-new');
    expect(changed.emailBlindIndex).toBe('blind-new');
    expect(changed.emailVerifiedAt).toBeNull();
  });

  it('rejects changing the email to one that is already taken', async () => {
    await users.create(newUser('taken'));
    const other = await users.create(newUser('other'));
    await expect(users.updateEmail(other.id, 'x', 'blind-taken')).rejects.toBeInstanceOf(
      UniqueConstraintError,
    );
  });

  it('updates password hash and last login', async () => {
    const created = await users.create(newUser('p'));
    const at = new Date('2026-01-01T00:00:00.000Z');
    expect((await users.updatePasswordHash(created.id, 'new-hash')).passwordHash).toBe('new-hash');
    expect((await users.touchLastLogin(created.id, at)).lastLoginAt?.toISOString()).toBe(
      at.toISOString(),
    );
  });

  it('throws RecordNotFoundError when updating or deleting a missing user', async () => {
    await expect(users.updateDisplayName('missing', 'x')).rejects.toBeInstanceOf(
      RecordNotFoundError,
    );
    await expect(users.delete('missing')).rejects.toBeInstanceOf(RecordNotFoundError);
  });

  it('cascades sessions on delete but keeps audit entries', async () => {
    const sessions = new SessionsRepository(db.prisma);
    const audit = new AuditLogRepository(db.prisma);
    const created = await users.create(newUser('del'));
    await sessions.create({
      userId: created.id,
      familyId: 'fam',
      refreshTokenHash: 'tok-del',
      expiresAt: new Date(Date.now() + 60_000),
      userAgent: null,
      ipHash: null,
    });
    const entry = await audit.record({
      userId: created.id,
      action: 'profile.update',
      ipHash: null,
      metadata: null,
    });

    await users.delete(created.id);

    expect(await sessions.findByTokenHash('tok-del')).toBeNull();
    const kept = await db.prisma.auditLog.findUnique({ where: { id: entry.id } });
    expect(kept).not.toBeNull();
    expect(kept?.userId).toBeNull();
  });
});
