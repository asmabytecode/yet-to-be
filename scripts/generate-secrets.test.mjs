import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createEnvFile, generateEnvContent } from './generate-secrets.mjs';

const EXAMPLE = [
  'NODE_ENV=development',
  'JWT_ACCESS_SECRET=change-me-min-64-chars',
  'PASSWORD_PEPPER=change-me',
  'COOKIE_SECRET=change-me',
  'DATA_ENCRYPTION_KEYS={"k1":"change-me-base64-32-bytes"}',
  'BLIND_INDEX_KEY=change-me-base64-32-bytes',
  'GOOGLE_CLIENT_ID=change-me.apps.googleusercontent.com',
  'GOOGLE_CLIENT_SECRET=change-me',
  'S3_SECRET_ACCESS_KEY=change-me',
  '# comment',
].join('\n');

const parse = (text) =>
  Object.fromEntries(
    text
      .split('\n')
      .map((line) => /^([A-Z0-9_]+)=(.*)$/.exec(line))
      .filter(Boolean)
      .map((m) => [m[1], m[2]]),
  );

describe('generateEnvContent', () => {
  it('replaces secret placeholders with strong random values', () => {
    const env = parse(generateEnvContent(EXAMPLE));

    expect(env.JWT_ACCESS_SECRET.length).toBeGreaterThanOrEqual(64);
    expect(env.PASSWORD_PEPPER.length).toBeGreaterThanOrEqual(32);
    expect(env.COOKIE_SECRET.length).toBeGreaterThanOrEqual(32);
    expect(env.BLIND_INDEX_KEY).toMatch(/^[A-Za-z0-9+/]{43}=$/);

    const keys = JSON.parse(env.DATA_ENCRYPTION_KEYS);
    expect(keys.k1).toMatch(/^[A-Za-z0-9+/]{43}=$/);
  });

  it('keeps non-secret lines and comments untouched', () => {
    const env = parse(generateEnvContent(EXAMPLE));

    expect(env.NODE_ENV).toBe('development');
    expect(generateEnvContent(EXAMPLE)).toContain('# comment');
  });

  it('generates a hex secret for the API storage user', () => {
    const env = parse(generateEnvContent(EXAMPLE));

    expect(env.S3_SECRET_ACCESS_KEY).toMatch(/^[0-9a-f]{64}$/);
  });

  it('leaves Google placeholders alone outside CI', () => {
    const env = parse(generateEnvContent(EXAMPLE));

    expect(env.GOOGLE_CLIENT_SECRET).toBe('change-me');
  });

  it('fills Google test values in CI mode', () => {
    const env = parse(generateEnvContent(EXAMPLE, { ci: true }));

    expect(env.GOOGLE_CLIENT_SECRET).not.toContain('change-me');
    expect(env.GOOGLE_CLIENT_ID).not.toContain('change-me');
  });

  it('generates different secrets on every run', () => {
    const a = parse(generateEnvContent(EXAMPLE));
    const b = parse(generateEnvContent(EXAMPLE));

    expect(a.JWT_ACCESS_SECRET).not.toBe(b.JWT_ACCESS_SECRET);
  });
});

describe('createEnvFile', () => {
  let dir;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ytb-secrets-'));
    writeFileSync(join(dir, '.env.example'), EXAMPLE);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('creates .env from .env.example', () => {
    const result = createEnvFile({ rootDir: dir });

    expect(result.created).toBe(true);
    expect(existsSync(join(dir, '.env'))).toBe(true);
  });

  it('creates .env.test in CI mode', () => {
    createEnvFile({ rootDir: dir, ci: true });

    expect(existsSync(join(dir, '.env.test'))).toBe(true);
    expect(existsSync(join(dir, '.env'))).toBe(false);
  });

  it('never overwrites existing values, only appends variables missing from .env', () => {
    writeFileSync(join(dir, '.env'), 'NODE_ENV=production\nPASSWORD_PEPPER=keep-me');

    const result = createEnvFile({ rootDir: dir });
    const text = readFileSync(join(dir, '.env'), 'utf8');
    const env = parse(text);

    expect(result.created).toBe(false);
    expect(text.startsWith('NODE_ENV=production\nPASSWORD_PEPPER=keep-me\n')).toBe(true);
    expect(env.NODE_ENV).toBe('production');
    expect(env.PASSWORD_PEPPER).toBe('keep-me');
    expect(text.match(/^PASSWORD_PEPPER=/gm)).toHaveLength(1);
    expect(env.S3_SECRET_ACCESS_KEY).toMatch(/^[0-9a-f]{64}$/);
    expect(result.added).toContain('S3_SECRET_ACCESS_KEY');
    expect(result.added).not.toContain('PASSWORD_PEPPER');
  });

  it('leaves an up-to-date .env untouched', () => {
    createEnvFile({ rootDir: dir });
    const before = readFileSync(join(dir, '.env'), 'utf8');

    const result = createEnvFile({ rootDir: dir });

    expect(result.added).toEqual([]);
    expect(readFileSync(join(dir, '.env'), 'utf8')).toBe(before);
  });
});
