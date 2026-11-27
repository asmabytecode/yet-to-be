import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { createTestConfig } from '../../test/config';
import { AuthCookies } from './auth-cookies';

/** Окремі mock-функції, щоб не звертатися до методів Response без контексту (unbound-method). */
function fakeResponse() {
  const cookie = vi.fn();
  const clearCookie = vi.fn();
  return { res: { cookie, clearCookie } as unknown as Response, cookie, clearCookie };
}

const tokens = { accessToken: 'at', refreshToken: 'rt', csrfToken: 'csrf' };

describe('AuthCookies', () => {
  it('uses plain names without Secure over http (localhost)', () => {
    const cookies = new AuthCookies(createTestConfig({ APP_URL: 'http://localhost:8080' }));
    const { res, cookie } = fakeResponse();

    cookies.setSession(res, tokens);

    expect(cookies.names).toEqual({
      access: 'ytb_at',
      refresh: 'ytb_rt',
      csrf: 'ytb_csrf',
      oauth: 'yt_oauth',
    });
    expect(cookie).toHaveBeenCalledWith(
      'ytb_at',
      'at',
      expect.objectContaining({ httpOnly: true, secure: false, sameSite: 'strict', path: '/' }),
    );
    expect(cookie).toHaveBeenCalledWith(
      'ytb_rt',
      'rt',
      expect.objectContaining({ httpOnly: true, path: '/api/v1/auth' }),
    );
    expect(cookie).toHaveBeenCalledWith(
      'ytb_csrf',
      'csrf',
      expect.objectContaining({ httpOnly: false }),
    );
  });

  it('uses __Host-/__Secure- prefixes and Secure over https', () => {
    const cookies = new AuthCookies(createTestConfig({ APP_URL: 'https://example.com' }));
    const { res, cookie } = fakeResponse();

    cookies.setSession(res, tokens);

    expect(cookies.names.access).toBe('__Host-ytb_at');
    expect(cookies.names.refresh).toBe('__Secure-ytb_rt');
    expect(cookie).toHaveBeenCalledWith(
      '__Host-ytb_at',
      'at',
      expect.objectContaining({ secure: true }),
    );
  });

  it('clears all session cookies with matching paths', () => {
    const cookies = new AuthCookies(createTestConfig());
    const { res, clearCookie } = fakeResponse();

    cookies.clearSession(res);

    expect(clearCookie).toHaveBeenCalledTimes(3);
    expect(clearCookie).toHaveBeenCalledWith(
      'ytb_rt',
      expect.objectContaining({ path: '/api/v1/auth' }),
    );
  });

  it('ignores a tampered or malformed OAuth transaction cookie', () => {
    const cookies = new AuthCookies(createTestConfig());
    const read = (value: unknown) =>
      cookies.readOAuthTransaction({ signedCookies: { yt_oauth: value } } as unknown as Request);

    expect(read(false)).toBeUndefined();
    expect(read('not json')).toBeUndefined();
    expect(read(JSON.stringify({ state: 's' }))).toBeUndefined();
    expect(
      read(JSON.stringify({ state: 's', nonce: 'n', codeVerifier: 'v', returnTo: '/' })),
    ).toEqual({ state: 's', nonce: 'n', codeVerifier: 'v', returnTo: '/' });
  });

  it('reads only non-empty string cookies', () => {
    const cookies = new AuthCookies(createTestConfig());
    const req = { cookies: { ytb_at: '', ytb_rt: 'refresh', ytb_csrf: 42 } } as unknown as Request;

    expect(cookies.readAccess(req)).toBeUndefined();
    expect(cookies.readRefresh(req)).toBe('refresh');
    expect(cookies.readCsrf(req)).toBeUndefined();
  });
});
