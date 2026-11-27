import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { UniqueConstraintError } from '../errors';
import {
  clearDatabase,
  createTestDatabase,
  makeUserInput,
  type TestDatabase,
} from '../test-database.fixture';
import { OAuthAccountsRepository } from './oauth-accounts.repository';
import { UsersRepository } from './users.repository';

describe('OAuthAccountsRepository', () => {
  let db: TestDatabase;
  let accounts: OAuthAccountsRepository;
  let users: UsersRepository;
  let userId: string;

  beforeAll(async () => {
    db = await createTestDatabase();
    accounts = new OAuthAccountsRepository(db.prisma);
    users = new UsersRepository(db.prisma);
  });

  afterAll(async () => {
    await db.cleanup();
  });

  beforeEach(async () => {
    await clearDatabase(db.prisma);
    userId = (await users.create(makeUserInput('oauth', { passwordHash: null }))).id;
  });

  it('links and finds an account by provider identity', async () => {
    await accounts.link({ userId, provider: 'google', providerAccountId: 'sub-1' });
    const found = await accounts.findByProviderAccount('google', 'sub-1');
    expect(found?.userId).toBe(userId);
    expect(await accounts.findByProviderAccount('google', 'other')).toBeNull();
  });

  it('rejects linking the same provider identity twice', async () => {
    await accounts.link({ userId, provider: 'google', providerAccountId: 'sub-1' });
    await expect(
      accounts.link({ userId, provider: 'google', providerAccountId: 'sub-1' }),
    ).rejects.toBeInstanceOf(UniqueConstraintError);
  });

  it('lists accounts for a user and unlinks them', async () => {
    await accounts.link({ userId, provider: 'google', providerAccountId: 'sub-1' });
    expect(await accounts.listForUser(userId)).toHaveLength(1);
    expect(await accounts.unlink(userId, 'google')).toBe(true);
    expect(await accounts.unlink(userId, 'google')).toBe(false);
    expect(await accounts.listForUser(userId)).toEqual([]);
  });

  it('removes linked accounts when the user is deleted', async () => {
    await accounts.link({ userId, provider: 'google', providerAccountId: 'sub-1' });
    await users.delete(userId);
    expect(await accounts.findByProviderAccount('google', 'sub-1')).toBeNull();
  });
});
