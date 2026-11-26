import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { AppConfigService } from '../config/app-config.service';
import { PrismaClient } from '../generated/prisma/client';
import { resolveSqliteUrl, sqliteFilePath } from './sqlite-url';

/** Єдина точка доступу до БД. Налаштовує SQLite (WAL, foreign keys, busy timeout). */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(@Inject(AppConfigService) config: Pick<AppConfigService, 'database'>) {
    super({ adapter: PrismaService.createAdapter(config.database.url) });
  }

  private static createAdapter(rawUrl: string): PrismaBetterSqlite3 {
    // Відносні шляхи рахуються від робочої директорії API (apps/api).
    const url = resolveSqliteUrl(rawUrl, process.cwd());
    const file = sqliteFilePath(url);
    if (file !== null) {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- шлях з конфігурації, не з вводу користувача
      mkdirSync(dirname(file), { recursive: true });
    }
    return new PrismaBetterSqlite3({ url });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    // PRAGMA-и повертають рядки, тому використовуємо $queryRaw, а не $executeRaw.
    await this.$queryRaw`PRAGMA journal_mode = WAL`;
    await this.$queryRaw`PRAGMA foreign_keys = ON`;
    await this.$queryRaw`PRAGMA busy_timeout = 5000`;
    await this.$queryRaw`PRAGMA synchronous = NORMAL`;
    this.logger.log('SQLite connected (WAL, foreign_keys=ON)');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
