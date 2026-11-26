import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '../src/generated/prisma/client';
import { resolveSqliteUrl, sqliteFilePath } from '../src/database/sqlite-url';

/**
 * Dev-seed. Свідомо НЕ створює користувачів: для цього потрібне шифрування PII
 * та argon2id (Етап 4), а сідити відкриті email/паролі небезпечно.
 * Зараз скрипт лише перевіряє, що БД доступна, і пише службову подію в журнал аудиту.
 * Користувачів для розробки додамо після Етапу 4 через ті самі сервіси.
 */
async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed: NODE_ENV=production.');
  }

  loadEnv({ path: path.resolve(process.cwd(), '../../.env'), quiet: true });
  const url = resolveSqliteUrl(process.env.DATABASE_URL ?? 'file:./data/yettobe.db', process.cwd());
  const file = sqliteFilePath(url);
  if (file !== null) {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- шлях з конфігурації
    mkdirSync(path.dirname(file), { recursive: true });
  }

  const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) });
  try {
    await prisma.auditLog.create({
      data: { userId: null, action: 'system.seeded', metadata: JSON.stringify({ seed: 'dev' }) },
    });
    const total = await prisma.auditLog.count();
    process.stdout.write(`Seed finished. Audit log entries: ${String(total)}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
  process.exitCode = 1;
});
