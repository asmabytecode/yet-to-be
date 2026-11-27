/* eslint-disable n/no-process-env, no-console -- CLI-скрипт: читає DATABASE_URL і звітує в консоль */
// Онлайн-бекап SQLite через better-sqlite3 `.backup()`: консистентна копія навіть під час
// роботи API (WAL), на відміну від простого копіювання файлу.
//
//   pnpm db:backup [outDir]          локально (outDir за замовчуванням — data/backups поруч із БД)
//   docker compose run --rm --no-deps api node scripts/backup-db.mjs   у контейнері
import { mkdirSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import Database from 'better-sqlite3';

const url = process.env.DATABASE_URL ?? 'file:./data/yettobe.db';
if (!url.startsWith('file:')) {
  console.error('DATABASE_URL must start with "file:" (SQLite).');
  process.exit(1);
}

const target = url.slice('file:'.length);
const dbPath = isAbsolute(target) ? target : resolve(process.cwd(), target);
const outDir = resolve(process.argv[2] ?? join(dirname(dbPath), 'backups'));
mkdirSync(outDir, { recursive: true, mode: 0o700 });

const stamp = new Date()
  .toISOString()
  .replaceAll(':', '-')
  .replace(/\.\d+Z$/, 'Z');
const outFile = join(outDir, `yettobe-${stamp}.db`);

const db = new Database(dbPath, { readonly: true, fileMustExist: true });
try {
  await db.backup(outFile);
  console.log(`Backup written: ${outFile}`);
} finally {
  db.close();
}
