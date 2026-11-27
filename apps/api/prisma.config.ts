import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'prisma/config';
import { resolveSqliteUrl } from './src/database/sqlite-url';

// Prisma 7 не читає .env автоматично. Команди запускаються з apps/api,
// тому спільний .env лежить у корені монорепо.
loadEnv({ path: path.resolve(process.cwd(), '../../.env'), quiet: true });

// Той самий резолвер шляху, що й у PrismaService: CLI і застосунок завжди бачать один файл.
const databaseUrl = resolveSqliteUrl(
  process.env.DATABASE_URL ?? 'file:./data/yettobe.db',
  process.cwd(),
);

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: databaseUrl,
  },
});
