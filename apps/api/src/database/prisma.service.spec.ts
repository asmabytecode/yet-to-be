import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from './test-database.fixture';

describe('PrismaService', () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createTestDatabase();
  });

  afterAll(async () => {
    await db.cleanup();
  });

  it('enables WAL journal mode', async () => {
    const rows = await db.prisma.$queryRaw<{ journal_mode: string }[]>`PRAGMA journal_mode`;
    expect(rows[0]?.journal_mode).toBe('wal');
  });

  it('enforces foreign keys', async () => {
    const rows = await db.prisma.$queryRaw<
      { foreign_keys: number | bigint }[]
    >`PRAGMA foreign_keys`;
    expect(Number(rows[0]?.foreign_keys)).toBe(1);
  });

  it('rejects a session that references a missing user', async () => {
    await expect(
      db.prisma.session.create({
        data: {
          userId: 'missing-user',
          familyId: 'f1',
          refreshTokenHash: 'hash-fk',
          expiresAt: new Date(Date.now() + 60_000),
        },
      }),
    ).rejects.toThrow();
  });
});
