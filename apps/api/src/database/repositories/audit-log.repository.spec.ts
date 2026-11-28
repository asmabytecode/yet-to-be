import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  clearDatabase,
  createTestDatabase,
  makeUserInput,
  type TestDatabase,
} from '../test-database.fixture';
import { runInRequestScope } from '../../platform/request-scope';
import { verifyChain } from '../audit-chain';
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
    userId = (await new UsersRepository(db.prisma).create(makeUserInput('audit'))).id;
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

  it('chains records: sequence, previous hash and a verifiable hash', async () => {
    const first = await audit.record({ userId, action: 'a1', ipHash: null, metadata: null });
    const second = await audit.record({
      userId,
      actorId: 'admin-id',
      action: 'a2',
      ipHash: 'ip',
      metadata: { n: 1 },
      targetType: 'user',
      targetId: userId,
    });
    expect(first.seq).toBe(1);
    expect(first.prevHash).toBe('GENESIS');
    expect(second.seq).toBe(2);
    expect(second.prevHash).toBe(first.hash);
    expect(second.actorId).toBe('admin-id');
    expect(first.actorId).toBe(userId);

    const verdict = verifyChain(await audit.chainBatch(0, 100));
    expect(verdict).toMatchObject({ ok: true, checked: 2 });
  });

  it('detects tampering and deletion', async () => {
    for (const action of ['a1', 'a2', 'a3']) {
      await audit.record({ userId, action, ipHash: null, metadata: { action } });
    }
    await db.prisma.auditLog.updateMany({ where: { seq: 2 }, data: { action: 'forged' } });
    expect(verifyChain(await audit.chainBatch(0, 100))).toMatchObject({
      ok: false,
      brokenAtSeq: 2,
      reason: 'hash_mismatch',
    });

    await db.prisma.auditLog.deleteMany({ where: { seq: 2 } });
    expect(verifyChain(await audit.chainBatch(0, 100))).toMatchObject({
      ok: false,
      brokenAtSeq: 3,
      reason: 'gap',
    });
  });

  it('keeps the chain intact when concurrent writers race', async () => {
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        audit.record({ userId, action: `race${String(i)}`, ipHash: null, metadata: null }),
      ),
    );
    expect(verifyChain(await audit.chainBatch(0, 100))).toMatchObject({ ok: true, checked: 10 });
  });

  it('masks PII and secrets in metadata and stores the request id', async () => {
    const entry = await runInRequestScope({ requestId: 'req-12345678' }, () =>
      audit.record({
        userId,
        action: 'x',
        ipHash: null,
        metadata: {
          email: 'a@example.com',
          note: 'mail me at b@example.com',
          password: 'p',
          ok: 1,
        },
      }),
    );
    expect(entry.requestId).toBe('req-12345678');
    expect(entry.metadata).not.toContain('example.com');
    expect(JSON.parse(entry.metadata ?? '{}')).toMatchObject({ ok: 1, password: '[redacted]' });
  });

  it('exposes no update or delete methods (append-only)', () => {
    const methods = Object.getOwnPropertyNames(AuditLogRepository.prototype);
    expect(methods.filter((name) => /update|delete|remove|clear/i.test(name))).toEqual([]);
  });
});
