// Сканує зібраний фронтенд (dist/) на витік секретів: source maps, відомі патерни
// ключів і реальні значення секретних змінних із .env / process.env.
// Запускається після `vite build`; при знахідках завершується з кодом 1.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SECRET_ENV_KEYS = [
  'JWT_ACCESS_SECRET',
  'PASSWORD_PEPPER',
  'COOKIE_SECRET',
  'BLIND_INDEX_KEY',
  'DATA_ENCRYPTION_KEYS',
  'GOOGLE_CLIENT_SECRET',
];

const TEXT_EXTENSIONS = /\.(js|mjs|css|html|json|svg|txt|webmanifest)$/i;

const FORBIDDEN_PATTERNS = [
  { name: 'Google client secret pattern', regex: /GOCSPX-[A-Za-z0-9_-]{10,}/ },
  { name: 'private key block', regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
];

/** Простий парсер .env (KEY=value, коментарі #). */
export function parseDotenv(text) {
  const result = {};
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (match) result[match[1]] = match[2].trim();
  }
  return result;
}

/** Збирає реальні значення секретів (без плейсхолдерів і занадто коротких). */
export function collectSecretValues(env) {
  const values = [];
  for (const key of SECRET_ENV_KEYS) {
    const value = env[key];
    if (!value) continue;
    values.push(value);
    if (key === 'DATA_ENCRYPTION_KEYS') {
      try {
        values.push(...Object.values(JSON.parse(value)));
      } catch {
        // некоректний JSON — перевіряємо лише сам рядок
      }
    }
  }
  return values.filter((v) => typeof v === 'string' && v.length >= 16 && !v.includes('change-me'));
}

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

/** Повертає список проблем. Самі значення секретів у результат не потрапляють. */
export function findProblems({ distDir, secretValues = [] }) {
  const problems = [];
  if (!existsSync(distDir)) return [{ file: distDir, reason: 'dist directory not found' }];

  for (const file of walk(distDir)) {
    if (file.endsWith('.map')) {
      problems.push({ file, reason: 'source map must not be shipped' });
      continue;
    }
    if (!TEXT_EXTENSIONS.test(file)) continue;

    const content = readFileSync(file, 'utf8');
    for (const { name, regex } of FORBIDDEN_PATTERNS) {
      if (regex.test(content)) problems.push({ file, reason: `contains ${name}` });
    }
    if (secretValues.some((secret) => content.includes(secret))) {
      problems.push({ file, reason: 'contains the value of a secret environment variable' });
    }
  }
  return problems;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const distDir = resolve(process.cwd(), 'dist');
  const rootEnvPath = resolve(process.cwd(), '../../.env');
  const fileEnv = existsSync(rootEnvPath) ? parseDotenv(readFileSync(rootEnvPath, 'utf8')) : {};
  const secretValues = collectSecretValues({ ...fileEnv, ...process.env });

  const problems = findProblems({ distDir, secretValues });
  if (problems.length > 0) {
    console.error('check-dist-secrets: FAILED');
    for (const { file, reason } of problems) console.error(` - ${file}: ${reason}`);
    process.exit(1);
  }
  console.log('check-dist-secrets: dist is clean.');
}
