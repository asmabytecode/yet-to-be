// Створює .env із .env.example, підставляючи криптостійкі випадкові секрети.
// Наявний файл не перезаписує: лише дописує в кінець змінні, які з'явилися в .env.example
// пізніше (наприклад, S3_* з Етапу 14.6). Значення секретів у консоль не друкуються.
//
//   pnpm secrets:generate          -> .env
//   pnpm secrets:generate --ci     -> .env.test (разом із тестовими значеннями Google)

import { randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const b64 = (bytes) => randomBytes(bytes).toString('base64');

const GENERATORS = {
  JWT_ACCESS_SECRET: () => b64(64),
  PASSWORD_PEPPER: () => b64(32),
  COOKIE_SECRET: () => b64(32),
  BLIND_INDEX_KEY: () => b64(32),
  DATA_ENCRYPTION_KEYS: () => JSON.stringify({ k1: b64(32) }),
  // S3 (Етап 14.6): hex — без спецсимволів, безпечно і для JSON-конфігу SeaweedFS, і для S3 SDK.
  S3_SECRET_ACCESS_KEY: () => randomBytes(32).toString('hex'),
};

// У CI Google недоступний — підставляємо одноразові тестові значення.
const CI_GENERATORS = {
  GOOGLE_CLIENT_ID: () => 'ci-client.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: () => `ci-${randomBytes(12).toString('hex')}`,
};

/** Повертає вміст .env: у рядках із плейсхолдерами значення замінені на згенеровані. */
export function generateEnvContent(exampleText, { ci = false } = {}) {
  return exampleText
    .split(/\r?\n/)
    .map((line) => {
      const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
      if (!match) return line;
      const name = match[1];
      const generate = GENERATORS[name] ?? (ci ? CI_GENERATORS[name] : undefined);
      return generate ? `${name}=${generate()}` : line;
    })
    .join('\n');
}

const NAME_RE = /^([A-Z0-9_]+)=/;

/**
 * Рядки .env.example (зі згенерованими секретами), яких ще немає в наявному файлі.
 * Наявні змінні не змінюються й не дублюються.
 */
export function missingEnvLines(existingText, exampleText, { ci = false } = {}) {
  const present = new Set(
    existingText
      .split(/\r?\n/)
      .map((line) => NAME_RE.exec(line)?.[1])
      .filter(Boolean),
  );
  return generateEnvContent(exampleText, { ci })
    .split('\n')
    .filter((line) => {
      const name = NAME_RE.exec(line)?.[1];
      return name !== undefined && !present.has(name);
    });
}

/** Створює файл, якщо його ще немає; в наявний лише дописує нові змінні. */
export function createEnvFile({ rootDir, ci = false }) {
  const target = resolve(rootDir, ci ? '.env.test' : '.env');
  const example = readFileSync(resolve(rootDir, '.env.example'), 'utf8');

  if (existsSync(target)) {
    const existing = readFileSync(target, 'utf8');
    const lines = missingEnvLines(existing, example, { ci });
    if (lines.length > 0) {
      const separator = existing === '' || existing.endsWith('\n') ? '' : '\n';
      const block = [
        '',
        '# ---- Додано pnpm secrets:generate (нові змінні з .env.example) ----',
        ...lines,
      ];
      appendFileSync(target, `${separator}${block.join('\n')}\n`);
    }
    return { created: false, path: target, added: lines.map((line) => NAME_RE.exec(line)?.[1]) };
  }

  writeFileSync(target, generateEnvContent(example, { ci }), { mode: 0o600 });
  return { created: true, path: target, added: [] };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const ci = process.argv.includes('--ci');
  const { created, path, added } = createEnvFile({ rootDir, ci });

  if (!created) {
    // Лише назви змінних, ніколи значення.
    console.log(
      added.length === 0
        ? `${path} already exists and is up to date — nothing changed.`
        : `${path} already exists — appended new variables: ${added.join(', ')}`,
    );
  } else {
    console.log(`Created ${path} with freshly generated secrets.`);
    if (!ci) {
      console.log('Next: set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (see stage 7).');
    }
  }
}
