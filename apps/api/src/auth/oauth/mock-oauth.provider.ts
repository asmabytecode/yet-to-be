import { createHash, randomBytes } from 'node:crypto';
import { emailSchema } from '@yet-to-be/shared';
import {
  type OAuthAuthorization,
  OAuthError,
  type OAuthProfile,
  type OAuthProvider,
} from './oauth-provider';

const randomUrlSafe = (bytes: number): string => randomBytes(bytes).toString('base64url');

/** Шлях сторінки згоди mock-провайдера відносно глобального префікса API. */
export const MOCK_CONSENT_PATH = 'auth/google/mock-consent';

/**
 * Mock Google для E2E (OAUTH_MOCK=true, заборонено в production). Замість accounts.google.com
 * браузер потрапляє на локальну сторінку згоди, де вводиться email; цей email повертається
 * як `code`, а профіль будується детерміновано. Потік state/cookie/redirect — той самий, що з Google.
 */
export class MockOAuthProvider implements OAuthProvider {
  readonly name = 'google';

  constructor(private readonly consentUrl: string) {}

  createAuthorization(): OAuthAuthorization {
    const state = randomUrlSafe(32);
    const url = new URL(this.consentUrl);
    url.searchParams.set('state', state);
    return {
      url: url.toString(),
      transaction: { state, nonce: randomUrlSafe(32), codeVerifier: randomUrlSafe(48) },
    };
  }

  handleCallback(code: string): Promise<OAuthProfile> {
    const parsed = emailSchema.safeParse(code.trim().toLowerCase());
    if (!parsed.success) {
      return Promise.reject(new OAuthError('Mock provider expects an email address as the code'));
    }
    const email = parsed.data;
    const subject = `mock-${createHash('sha256').update(email).digest('hex').slice(0, 32)}`;
    return Promise.resolve({
      provider: 'google',
      subject,
      email,
      emailVerified: true,
      name: email.split('@')[0] ?? null,
    });
  }
}
