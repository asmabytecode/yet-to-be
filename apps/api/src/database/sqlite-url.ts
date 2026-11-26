import { isAbsolute, resolve } from 'node:path';

const FILE_PREFIX = 'file:';
const IN_MEMORY = ':memory:';

/**
 * Перетворює SQLite URL виду `file:./data/app.db` на `file:<абсолютний шлях>`.
 * Відносні шляхи рахуються від `baseDir`, тому CLI Prisma, застосунок і тести
 * завжди вказують на той самий файл. Слеші нормалізуються (Windows-шляхи теж працюють).
 */
export function resolveSqliteUrl(url: string, baseDir: string): string {
  if (!url.startsWith(FILE_PREFIX)) {
    throw new Error('DATABASE_URL must start with "file:" (SQLite).');
  }
  const target = url.slice(FILE_PREFIX.length);
  if (target === '' || target === IN_MEMORY) {
    return url;
  }
  const absolute = isAbsolute(target) ? target : resolve(baseDir, target);
  return `${FILE_PREFIX}${absolute.replaceAll('\\', '/')}`;
}

/** Повертає шлях до файлу БД з URL (або null для in-memory). */
export function sqliteFilePath(url: string): string | null {
  if (!url.startsWith(FILE_PREFIX)) {
    throw new Error('Not a SQLite file URL.');
  }
  const target = url.slice(FILE_PREFIX.length);
  return target === '' || target === IN_MEMORY ? null : target;
}
