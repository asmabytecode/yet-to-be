import { describe, expect, it } from 'vitest';
import { checkHeaders, firstAssetPath } from './check-headers.mjs';

const rules = {
  'x-content-type-options': (v) => v === 'nosniff',
  'x-frame-options': (v) => v === 'DENY',
};

describe('checkHeaders', () => {
  it('passes when all required headers are present and nothing leaks', () => {
    const headers = new Headers({
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      server: 'nginx',
    });
    expect(checkHeaders(headers, rules)).toEqual([]);
  });

  it('reports missing headers, wrong values and version leaks', () => {
    const headers = new Headers({
      'x-frame-options': 'SAMEORIGIN',
      'x-powered-by': 'Express',
      server: 'nginx/1.27.3',
    });
    expect(checkHeaders(headers, rules)).toEqual([
      'x-powered-by must be absent',
      'server header leaks a version: "nginx/1.27.3"',
      'x-content-type-options is missing',
      'x-frame-options has unexpected value "SAMEORIGIN"',
    ]);
  });
});

describe('firstAssetPath', () => {
  it('finds the hashed entry bundle', () => {
    const html = '<script type="module" crossorigin src="/assets/index-AbC123.js"></script>';
    expect(firstAssetPath(html)).toBe('/assets/index-AbC123.js');
  });

  it('returns null when there is no bundle', () => {
    expect(firstAssetPath('<html></html>')).toBeNull();
  });

  it('finds the admin bundle only under /admin/assets', () => {
    const html = '<script type="module" src="/admin/assets/index-Xy9.js"></script>';
    expect(firstAssetPath(html, '/admin')).toBe('/admin/assets/index-Xy9.js');
    expect(firstAssetPath(html)).toBeNull();
    expect(firstAssetPath('<script src="/assets/index-1.js"></script>', '/admin')).toBeNull();
  });
});
