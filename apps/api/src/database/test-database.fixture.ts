import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { PrismaService } from './prisma.service';

export interface TestDatabase {
  prisma: PrismaService;
  /** Закриває з'єднання й видаляє тимчасові файли. */
  cleanup: () => Promise<void>;
}

/** Застосовує файли migration.sql з усіх підпапок prisma/migrations до порожнього файлу БД. */
function applyMigrations(file: string): void {
  const migrationsDir = resolve(process.cwd(), 'prisma/migrations');
  const names = readdirSync(migrationsDir)
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- ім'я з readdirSync
    .filter((name) => statSync(join(migrationsDir, name)).isDirectory())
    .sort();
  if (names.length === 0) {
    throw new Error('No migrations found. Run "pnpm db:migrate:dev --name init" first.');
  }
  const db = new Database(file);
  try {
    for (const name of names) {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- ім'я з readdirSync
      db.exec(readFileSync(join(migrationsDir, name, 'migration.sql'), 'utf8'));
    }
  } finally {
    db.close();
  }
}

/**
 * Створює ізольовану SQLite-БД у тимчасовій директорії зі схемою з реальних міграцій.
 * Кожен тестовий файл отримує власну БД, тому тести можна безпечно запускати паралельно.
 */
export async function createTestDatabase(): Promise<TestDatabase> {
  const dir = mkdtempSync(join(tmpdir(), 'yet-to-be-test-'));
  const file = join(dir, 'test.db');
  applyMigrations(file);

  const prisma = new PrismaService({ database: { url: `file:${file.replaceAll('\\', '/')}` } });
  await prisma.onModuleInit();

  return {
    prisma,
    cleanup: async () => {
      await prisma.onModuleDestroy();
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    },
  };
}

/** Очищує всі таблиці (у порядку, що поважає зовнішні ключі). */
export async function clearDatabase(prisma: PrismaService): Promise<void> {
  await prisma.auditLog.deleteMany();
  await prisma.session.deleteMany();
  await prisma.oAuthAccount.deleteMany();
  await prisma.user.deleteMany();
}
