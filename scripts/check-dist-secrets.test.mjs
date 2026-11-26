import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { collectSecretValues, findProblems, parseDotenv } from './check-dist-secrets.mjs';

// Збираємо "секрет" з частин, щоб секрет-сканери не реагували на сам тест.
const FAKE_GOOGLE_SECRET = ['GOCSP', 'X-', 'abcdefghijklmnop'].join('');
const REAL_SECRET = 'a-long-random-secret-value-1234567890';

describe('findProblems', () => {
  let dist;

  beforeEach(() => {
    dist = mkdtempSync(join(tmpdir(), 'ytb-dist-'));
    mkdirSync(join(dist, 'assets'));
  });

  afterEach(() => {
    rmSync(dist, { recursive: true, force: true });
  });

  it('passes on a clean build', () => {
    writeFileSync(join(dist, 'index.html'), '<html></html>');
    writeFileSync(join(dist, 'assets', 'app.js'), 'console.log("hello")');

    expect(findProblems({ distDir: dist, secretValues: [REAL_SECRET] })).toEqual([]);
  });

  it('fails on source maps', () => {
    writeFileSync(join(dist, 'assets', 'app.js.map'), '{}');

    const problems = findProblems({ distDir: dist });

    expect(problems).toHaveLength(1);
    expect(problems[0].reason).toMatch(/source map/);
  });

  it('fails on a leaked secret value', () => {
    writeFileSync(join(dist, 'assets', 'app.js'), `const k="${REAL_SECRET}";`);

    const problems = findProblems({ distDir: dist, secretValues: [REAL_SECRET] });

    expect(problems).toHaveLength(1);
    expect(JSON.stringify(problems)).not.toContain(REAL_SECRET);
  });

  it('fails on known key patterns', () => {
    writeFileSync(join(dist, 'assets', 'app.js'), `x="${FAKE_GOOGLE_SECRET}"`);

    expect(findProblems({ distDir: dist }).length).toBeGreaterThan(0);
  });

  it('reports a missing dist directory', () => {
    expect(findProblems({ distDir: join(dist, 'nope') })).toHaveLength(1);
  });
});

describe('collectSecretValues', () => {
  it('ignores placeholders and short values', () => {
    const values = collectSecretValues({
      JWT_ACCESS_SECRET: 'change-me-min-64-chars',
      PASSWORD_PEPPER: 'short',
      COOKIE_SECRET: REAL_SECRET,
    });

    expect(values).toEqual([REAL_SECRET]);
  });

  it('extracts each key from DATA_ENCRYPTION_KEYS', () => {
    const keyA = 'A'.repeat(43) + '=';
    const values = collectSecretValues({ DATA_ENCRYPTION_KEYS: JSON.stringify({ k1: keyA }) });

    expect(values).toContain(keyA);
  });
});

describe('parseDotenv', () => {
  it('parses KEY=value lines and skips comments', () => {
    expect(parseDotenv('# c\nA=1\nB = two words\n')).toEqual({ A: '1', B: 'two words' });
  });
});
