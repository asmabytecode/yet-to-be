import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose';
import { AppConfigService } from '../../config/app-config.service';
import {
  type OAuthAuthorization,
  OAuthError,
  type OAuthProfile,
  type OAuthProvider,
  type OAuthTransaction,
} from './oauth-provider';

export const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
const REQUEST_TIMEOUT_MS = 10_000;

export const GOOGLE_PROVIDER_OPTIONS = Symbol('GOOGLE_PROVIDER_OPTIONS');

/** Для тестів: підміна мережі та ключів підпису. */
export interface GoogleProviderOptions {
  fetch?: typeof fetch;
  jwks?: JWTVerifyGetKey;
}

const randomUrlSafe = (bytes: number): string => randomBytes(bytes).toString('base64url');

export function pkceChallenge(codeVerifier: string): string {
  return createHash('sha256').update(codeVerifier).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Google OpenID Connect: Authorization Code + PKCE (S256), state і nonce.
 * Client Secret використовується лише тут, на бекенді.
 */
@Injectable()
export class GoogleOAuthProvider implements OAuthProvider {
  readonly name = 'google';
  private readonly fetchImpl: typeof fetch;
  private jwks: JWTVerifyGetKey | undefined;

  constructor(
    @Inject(AppConfigService) private readonly config: Pick<AppConfigService, 'google'>,
    @Optional() @Inject(GOOGLE_PROVIDER_OPTIONS) options?: GoogleProviderOptions,
  ) {
    this.fetchImpl = options?.fetch ?? fetch;
    this.jwks = options?.jwks;
  }

  createAuthorization(): OAuthAuthorization {
    const state = randomUrlSafe(32);
    const nonce = randomUrlSafe(32);
    const codeVerifier = randomUrlSafe(48);
    const { clientId, callbackUrl } = this.config.google;

    const url = new URL(GOOGLE_AUTH_URL);
    url.search = new URLSearchParams({
      client_id: clientId,
      redirect_uri: callbackUrl,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      nonce,
      code_challenge: pkceChallenge(codeVerifier),
      code_challenge_method: 'S256',
      prompt: 'select_account',
    }).toString();

    return { url: url.toString(), transaction: { state, nonce, codeVerifier } };
  }

  async handleCallback(code: string, transaction: OAuthTransaction): Promise<OAuthProfile> {
    const idToken = await this.exchangeCode(code, transaction.codeVerifier);

    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(idToken, this.keys(), {
        issuer: GOOGLE_ISSUERS,
        audience: this.config.google.clientId,
        algorithms: ['RS256'],
      }));
    } catch {
      throw new OAuthError('ID token verification failed');
    }

    if (typeof payload.nonce !== 'string' || !safeEqual(payload.nonce, transaction.nonce)) {
      throw new OAuthError('ID token nonce mismatch');
    }
    const { sub, email } = payload;
    if (typeof sub !== 'string' || sub === '' || typeof email !== 'string' || email === '') {
      throw new OAuthError('ID token is missing sub or email');
    }
    const verified = payload['email_verified'];

    return {
      provider: this.name,
      subject: sub,
      email,
      emailVerified: verified === true || verified === 'true',
      name: typeof payload['name'] === 'string' ? payload['name'] : null,
    };
  }

  private keys(): JWTVerifyGetKey {
    this.jwks ??= createRemoteJWKSet(new URL(GOOGLE_JWKS_URL));
    return this.jwks;
  }

  private async exchangeCode(code: string, codeVerifier: string): Promise<string> {
    const { clientId, clientSecret, callbackUrl } = this.config.google;
    let response: Response;
    try {
      response = await this.fetchImpl(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: callbackUrl,
          client_id: clientId,
          client_secret: clientSecret,
          code_verifier: codeVerifier,
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new OAuthError('Token endpoint is unreachable');
    }
    if (!response.ok) {
      throw new OAuthError(`Token endpoint answered ${String(response.status)}`);
    }
    const body = (await response.json().catch(() => null)) as { id_token?: unknown } | null;
    if (typeof body?.id_token !== 'string') {
      throw new OAuthError('Token response has no id_token');
    }
    return body.id_token;
  }
}
