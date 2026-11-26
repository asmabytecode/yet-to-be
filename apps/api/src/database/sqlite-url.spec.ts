import { describe, expect, it } from 'vitest';
import { resolveSqliteUrl, sqliteFilePath } from './sqlite-url';

describe('resolveSqliteUrl', () => {
  it('resolves a relative path against the base directory', () => {
    const url = resolveSqliteUrl('file:./data/app.db', '/srv/api');
    expect(url.startsWith('file:')).toBe(true);
    expect(url.endsWith('/srv/api/data/app.db')).toBe(true);
  });

  it('keeps an absolute path as is', () => {
    expect(resolveSqliteUrl('file:/var/db/app.db', '/srv/api')).toBe('file:/var/db/app.db');
  });

  it('never produces backslashes', () => {
    expect(resolveSqliteUrl('file:./a/b.db', 'C:\\work\\api')).not.toContain('\\');
  });

  it('leaves in-memory URLs untouched', () => {
    expect(resolveSqliteUrl('file::memory:', '/srv/api')).toBe('file::memory:');
  });

  it('rejects non-SQLite URLs', () => {
    expect(() => resolveSqliteUrl('postgres://localhost/db', '/srv/api')).toThrow('file:');
  });
});

describe('sqliteFilePath', () => {
  it('returns the file path', () => {
    expect(sqliteFilePath('file:/var/db/app.db')).toBe('/var/db/app.db');
  });

  it('returns null for in-memory databases', () => {
    expect(sqliteFilePath('file::memory:')).toBeNull();
  });

  it('rejects non-SQLite URLs', () => {
    expect(() => sqliteFilePath('mysql://x')).toThrow();
  });
});
