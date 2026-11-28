import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AuditService } from '../modules/audit';
import { CliModule } from './cli.module';

/**
 * Перевіряє хеш-ланцюжок журналу: підміну, видалення, вставку записів.
 *   розробка:   pnpm audit:verify
 *   контейнер:  docker compose exec api node dist/cli/audit-verify.js
 * Хеш голови варто періодично зберігати поза сервером — тоді видно й обрізання хвоста.
 */
async function main(): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-class-instance-assignment -- літерал опцій Nest
  const app = await NestFactory.createApplicationContext(CliModule, { logger: ['error', 'warn'] });
  try {
    const verdict = await app.get(AuditService).verify();
    if (verdict.ok) {
      const head =
        verdict.head === null
          ? 'empty'
          : `seq=${String(verdict.head.seq)} hash=${verdict.head.hash}`;
      process.stdout.write(`Audit chain OK: ${String(verdict.checked)} records, head ${head}\n`);
      return 0;
    }
    process.stderr.write(
      `Audit chain BROKEN at seq=${String(verdict.brokenAtSeq)} (${verdict.reason}); ` +
        `${String(verdict.checked)} records verified before it.\n`,
    );
    return 1;
  } finally {
    await app.close();
  }
}

void main().then((code) => {
  process.exitCode = code;
});
