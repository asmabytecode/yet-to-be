import {
  type OAuthAuthorization,
  OAuthError,
  type OAuthProfile,
  type OAuthProvider,
} from '../src/auth/oauth/oauth-provider';

/** Тестова реалізація провайдера: жодних запитів до Google. */
export class FakeOAuthProvider implements OAuthProvider {
  readonly name = 'google';
  profile: OAuthProfile = {
    provider: 'google',
    subject: 'google-sub-1',
    email: 'ada@example.com',
    emailVerified: true,
    name: 'Ada Lovelace',
  };

  createAuthorization(): OAuthAuthorization {
    return {
      url: 'https://accounts.example.test/authorize?client_id=fake',
      transaction: { state: 'state-123', nonce: 'nonce-123', codeVerifier: 'verifier-123' },
    };
  }

  handleCallback(code: string): Promise<OAuthProfile> {
    if (code === 'bad') return Promise.reject(new OAuthError('Provider rejected the code'));
    return Promise.resolve(this.profile);
  }
}
