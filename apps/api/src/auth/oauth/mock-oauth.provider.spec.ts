import { describe, expect, it } from 'vitest';
import { MockOAuthProvider } from './mock-oauth.provider';
import { OAuthError } from './oauth-provider';

const CONSENT = 'http://localhost:8080/api/v1/auth/google/mock-consent';

describe('MockOAuthProvider', () => {
  const provider = new MockOAuthProvider(CONSENT);

  it('points the browser at the local consent page with a fresh state', () => {
    const first = provider.createAuthorization();
    const second = provider.createAuthorization();
    const url = new URL(first.url);

    expect(`${url.origin}${url.pathname}`).toBe(CONSENT);
    expect(url.searchParams.get('state')).toBe(first.transaction.state);
    expect(first.transaction.state).not.toBe(second.transaction.state);
    expect(first.transaction.nonce.length).toBeGreaterThan(20);
    expect(first.transaction.codeVerifier.length).toBeGreaterThan(40);
  });

  it('turns an email code into a stable, verified Google profile', async () => {
    const a = await provider.handleCallback(' Grace@Example.com ');
    const b = await provider.handleCallback('grace@example.com');

    expect(a).toEqual(b);
    expect(a).toMatchObject({
      provider: 'google',
      email: 'grace@example.com',
      emailVerified: true,
      name: 'grace',
    });
    expect(a.subject).toMatch(/^mock-[0-9a-f]{32}$/);
  });

  it('rejects a code that is not an email', async () => {
    await expect(provider.handleCallback('not-an-email')).rejects.toBeInstanceOf(OAuthError);
  });
});
