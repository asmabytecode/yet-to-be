// Створює .env із .env.example, підставляючи криптостійкі випадкові секрети.
// Ніколи не перезаписує наявний файл. Значення секретів у консоль не друкуються.
//
//   pnpm secrets:generate          -> .env
//   pnpm secrets:generate --ci     -> .env.test (разом із тестовими значеннями Google)

import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const b64 = (bytes) => randomBytes(bytes).toString('base64');

const GENERATORS = {
  JWT_ACCESS_SECRET: () => b64(64),
  PASSWORD_PEPPER: () => b64(32),
  COOKIE_SECRET: () => b64(32),
  BLIND_INDEX_KEY: () => b64(32),
  DATA_ENCRYPTION_KEYS: () => JSON.stringify({ k1: b64(32) }),
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

/** Створює файл, якщо його ще немає. Існуючий ніколи не чіпає. */
export function createEnvFile({ rootDir, ci = false }) {
  const target = resolve(rootDir, ci ? '.env.test' : '.env');
  if (existsSync(target)) return { created: false, path: target };

  const example = readFileSync(resolve(rootDir, '.env.example'), 'utf8');
  writeFileSync(target, generateEnvContent(example, { ci }), { mode: 0o600 });
  return { created: true, path: target };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const ci = process.argv.includes('--ci');
  const { created, path } = createEnvFile({ rootDir, ci });

  if (!created) {
    console.log(`${path} already exists — nothing changed (existing files are never overwritten).`);
  } else {
    console.log(`Created ${path} with freshly generated secrets.`);
    if (!ci) {
      console.log('Next: set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (see stage 7).');
    }
  }
}
