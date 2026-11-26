import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearDatabase, createTestDatabase, type TestDatabase } from '../test-database.fixture';
import { AuditLogRepository } from './audit-log.repository';
import { UsersRepository } from './users.repository';

describe('AuditLogRepository', () => {
  let db: TestDatabase;
  let audit: AuditLogRepository;
  let userId: string;

  beforeAll(async () => {
    db = await createTestDatabase();
    audit = new AuditLogRepository(db.prisma);
  });

  afterAll(async () => {
    await db.cleanup();
  });

  beforeEach(async () => {
    await clearDatabase(db.prisma);
    userId = (
      await new UsersRepository(db.prisma).create({
        emailEncrypted: 'enc',
        emailBlindIndex: 'blind',
        passwordHash: null,
        displayNameEncrypted: null,
      })
    ).id;
  });

  it('records an event and serialises metadata as JSON', async () => {
    const entry = await audit.record({
      userId,
      action: 'auth.login.success',
      ipHash: 'ip',
      metadata: { method: 'password' },
    });
    expect(entry.metadata).toBe('{"method":"password"}');
  });

  it('records events without a user or metadata', async () => {
    const entry = await audit.record({
      userId: null,
      action: 'auth.login.failure',
      ipHash: null,
      metadata: null,
    });
    expect(entry.userId).toBeNull();
    expect(entry.metadata).toBeNull();
  });

  it('lists events for a user, newest first, with a limit', async () => {
    await db.prisma.auditLog.createMany({
      data: [
        { userId, action: 'a1', createdAt: new Date('2026-01-01T00:00:00.000Z') },
        { userId, action: 'a2', createdAt: new Date('2026-01-02T00:00:00.000Z') },
        { userId, action: 'a3', createdAt: new Date('2026-01-03T00:00:00.000Z') },
      ],
    });
    const list = await audit.listForUser(userId, 2);
    expect(list.map((e) => e.action)).toEqual(['a3', 'a2']);
  });

  it('deletes entries older than a date', async () => {
    await db.prisma.auditLog.createMany({
      data: [
        { userId, action: 'old', createdAt: new Date('2025-01-01T00:00:00.000Z') },
        { userId, action: 'new', createdAt: new Date('2026-06-01T00:00:00.000Z') },
      ],
    });
    expect(await audit.deleteOlderThan(new Date('2026-01-01T00:00:00.000Z'))).toBe(1);
    expect((await audit.listForUser(userId)).map((e) => e.action)).toEqual(['new']);
  });
});
