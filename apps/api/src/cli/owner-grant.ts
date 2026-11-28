import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { emailSchema } from '@yet-to-be/shared';
import { OwnerBootstrapService } from '../modules/iam';
import { CliModule } from './cli.module';

/**
 * Призначає власника (owner). Запускається лише на сервері, не через HTTP:
 *   розробка:   pnpm owner:grant you@example.com
 *   контейнер:  docker compose exec api node dist/cli/owner-grant.js you@example.com
 * Користувач має бути вже зареєстрований. Власник один.
 */
async function main(): Promise<number> {
  const email = emailSchema.safeParse(process.argv[2]);
  if (!email.success) {
    process.stderr.write('Usage: owner:grant <email>\n');
    return 2;
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-class-instance-assignment -- літерал опцій Nest
  const app = await NestFactory.createApplicationContext(CliModule, { logger: ['error', 'warn'] });
  try {
    const result = await app.get(OwnerBootstrapService).grantOwner(email.data);
    process.stdout.write(
      result.alreadyOwner ? 'This user is already the owner.\n' : 'Owner role granted.\n',
    );
    return 0;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : 'Failed'}\n`);
    return 1;
  } finally {
    await app.close();
  }
}

void main().then((code) => {
  process.exitCode = code;
});
