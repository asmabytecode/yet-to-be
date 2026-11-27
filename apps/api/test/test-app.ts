import type { Type } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { AppConfigService } from '../src/config/app-config.service';
import { createTestDatabase, type TestDatabase } from '../src/database/test-database.fixture';
import { PrismaService } from '../src/database/prisma.service';

export const API = '/api/v1';

export interface TestApp {
  app: NestExpressApplication;
  db: TestDatabase;
  /** Нова "браузерна сесія" з власним cookie jar. */
  agent: () => ReturnType<typeof request.agent>;
  close: () => Promise<void>;
}

/** Піднімає повний застосунок поверх ізольованої SQLite-БД з реальних міграцій. */
export async function createTestApp(extraControllers: Type[] = []): Promise<TestApp> {
  const db = await createTestDatabase();
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
    controllers: extraControllers,
  })
    .overrideProvider(PrismaService)
    .useValue(db.prisma)
    .compile();

  // eslint-disable-next-line @typescript-eslint/no-unsafe-class-instance-assignment -- літерал опцій Nest
  const app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
  configureApp(app, app.get(AppConfigService));
  await app.init();

  return {
    app,
    db,
    agent: () => request.agent(app.getHttpServer()),
    close: async () => {
      await app.close();
      await db.cleanup();
    },
  };
}

/** Додає до запиту CSRF-токен: спочатку GET /auth/csrf, далі заголовок X-CSRF-Token. */
export async function csrfToken(agent: ReturnType<typeof request.agent>): Promise<string> {
  const res = await agent.get(`${API}/auth/csrf`);
  return (res.body as { csrfToken: string }).csrfToken;
}

export function cookieValue(setCookie: unknown, name: string): string | undefined {
  const list = Array.isArray(setCookie) ? (setCookie as string[]) : [];
  const line = list.find((entry) => entry.startsWith(`${name}=`));
  return line?.slice(name.length + 1).split(';')[0];
}
