import { createHash } from 'node:crypto';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestConfig } from '../../../test/config';
import { GoogleOAuthProvider, GOOGLE_TOKEN_URL, pkceChallenge } from './google-oauth.provider';
import { OAuthError, type OAuthTransaction } from './oauth-provider';

const config = createTestConfig();
const CLIENT_ID = config.google.clientId;

describe('GoogleOAuthProvider', () => {
  let sign: (
    claims: Record<string, unknown>,
    overrides?: { iss?: string; aud?: string; exp?: string },
  ) => Promise<string>;
  let jwks: ReturnType<typeof createLocalJWKSet>;
  const tx: OAuthTransaction = {
    state: 's',
    nonce: 'nonce-1',
    codeVerifier: 'verifier-1',
    returnTo: '/',
  };

  beforeAll(async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    jwks = createLocalJWKSet({
      keys: [{ ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' }],
    });
    sign = (claims, overrides = {}) =>
      new SignJWT(claims)
        .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
        .setIssuer(overrides.iss ?? 'https://accounts.google.com')
        .setAudience(overrides.aud ?? CLIENT_ID)
        .setSubject('google-sub-1')
        .setIssuedAt()
        .setExpirationTime(overrides.exp ?? '5m')
        .sign(privateKey);
  });

  const providerWith = (idToken: () => Promise<string>, status = 200) => {
    const fetchMock = vi.fn(async () =>
      status === 200
        ? new Response(JSON.stringify({ id_token: await idToken() }), { status })
        : new Response('{}', { status }),
    );
    return { provider: new GoogleOAuthProvider(config, { fetch: fetchMock, jwks }), fetchMock };
  };

  const goodClaims = {
    email: 'ada@example.com',
    email_verified: true,
    name: 'Ada',
    nonce: 'nonce-1',
  };

  it('builds an authorization URL with state, nonce and PKCE S256', () => {
    const { provider } = providerWith(() => sign(goodClaims));
    const { url, transaction } = provider.createAuthorization();
    const params = new URL(url).searchParams;

    expect(params.get('response_type')).toBe('code');
    expect(params.get('scope')).toBe('openid email profile');
    expect(params.get('state')).toBe(transaction.state);
    expect(params.get('nonce')).toBe(transaction.nonce);
    expect(params.get('code_challenge_method')).toBe('S256');
    expect(params.get('code_challenge')).toBe(pkceChallenge(transaction.codeVerifier));
    expect(params.get('code_challenge')).toBe(
      createHash('sha256').update(transaction.codeVerifier).digest('base64url'),
    );
    expect(url).not.toContain(config.google.clientSecret);
  });

  it('generates fresh random values on every call', () => {
    const { provider } = providerWith(() => sign(goodClaims));
    const a = provider.createAuthorization().transaction;
    const b = provider.createAuthorization().transaction;
    expect(a.state).not.toBe(b.state);
    expect(a.nonce).not.toBe(b.nonce);
    expect(a.codeVerifier).not.toBe(b.codeVerifier);
  });

  it('exchanges the code (with PKCE verifier) and returns a verified profile', async () => {
    const { provider, fetchMock } = providerWith(() => sign(goodClaims));
    const profile = await provider.handleCallback('auth-code', tx);

    expect(profile).toEqual({
      provider: 'google',
      subject: 'google-sub-1',
      email: 'ada@example.com',
      emailVerified: true,
      name: 'Ada',
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { body: URLSearchParams }];
    expect(url).toBe(GOOGLE_TOKEN_URL);
    expect(init.body.get('code')).toBe('auth-code');
    expect(init.body.get('code_verifier')).toBe('verifier-1');
    expect(init.body.get('client_secret')).toBe(config.google.clientSecret);
  });

  it('treats email_verified "true" (string) as verified and anything else as not', async () => {
    const asString = providerWith(() => sign({ ...goodClaims, email_verified: 'true' }));
    expect((await asString.provider.handleCallback('c', tx)).emailVerified).toBe(true);
    const missing = providerWith(() => sign({ email: 'a@example.com', nonce: 'nonce-1' }));
    expect((await missing.provider.handleCallback('c', tx)).emailVerified).toBe(false);
  });

  it('rejects a wrong or missing nonce', async () => {
    const wrong = providerWith(() => sign({ ...goodClaims, nonce: 'other' }));
    await expect(wrong.provider.handleCallback('c', tx)).rejects.toThrow(OAuthError);
    const missing = providerWith(() => sign({ email: 'a@example.com' }));
    await expect(missing.provider.handleCallback('c', tx)).rejects.toThrow(OAuthError);
  });

  it('rejects wrong audience, issuer and expired tokens', async () => {
    for (const overrides of [
      { aud: 'someone-else' },
      { iss: 'https://evil.example' },
      { exp: '-1m' },
    ]) {
      const { provider } = providerWith(() => sign(goodClaims, overrides));
      await expect(provider.handleCallback('c', tx)).rejects.toThrow(OAuthError);
    }
  });

  it('rejects a token signed by an unknown key', async () => {
    const other = await generateKeyPair('RS256');
    const forged = await new SignJWT(goodClaims)
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuer('https://accounts.google.com')
      .setAudience(CLIENT_ID)
      .setSubject('x')
      .setExpirationTime('5m')
      .sign(other.privateKey);
    const { provider } = providerWith(() => Promise.resolve(forged));
    await expect(provider.handleCallback('c', tx)).rejects.toThrow(OAuthError);
  });

  it('rejects when email or sub is missing', async () => {
    const { provider } = providerWith(() => sign({ nonce: 'nonce-1' }));
    await expect(provider.handleCallback('c', tx)).rejects.toThrow('missing sub or email');
  });

  it('fails cleanly when the token endpoint errors, is unreachable or sends no id_token', async () => {
    await expect(
      providerWith(() => sign(goodClaims), 400).provider.handleCallback('c', tx),
    ).rejects.toThrow(OAuthError);

    const unreachable = new GoogleOAuthProvider(config, {
      fetch: () => Promise.reject(new Error('offline')),
      jwks,
    });
    await expect(unreachable.handleCallback('c', tx)).rejects.toThrow('unreachable');

    const empty = new GoogleOAuthProvider(config, {
      fetch: () => Promise.resolve(new Response('{}', { status: 200 })),
      jwks,
    });
    await expect(empty.handleCallback('c', tx)).rejects.toThrow('no id_token');
  });
});
