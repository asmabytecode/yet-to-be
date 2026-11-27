/** Дані, які бекенд тримає між редіректом на провайдера і поверненням (у підписаній cookie). */
export interface OAuthTransaction {
  state: string;
  nonce: string;
  codeVerifier: string;
  /** Безпечний відносний шлях, куди повернути користувача після входу. */
  returnTo: string;
}

/** Профіль, перевірений через ID token провайдера. */
export interface OAuthProfile {
  provider: string;
  /** Стабільний id акаунта в провайдера (`sub`). */
  subject: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
}

export interface OAuthAuthorization {
  url: string;
  transaction: Omit<OAuthTransaction, 'returnTo'>;
}

/**
 * Абстракція провайдера входу. AuthService нічого не знає про Google: додати GitHub чи Apple
 * означає написати ще одну реалізацію, а тести підміняють її без мережі.
 */
export interface OAuthProvider {
  readonly name: string;
  createAuthorization(): OAuthAuthorization;
  /** Обмінює code на токени та повертає перевірений профіль. Кидає OAuthError. */
  handleCallback(code: string, transaction: OAuthTransaction): Promise<OAuthProfile>;
}

export const OAUTH_PROVIDER = Symbol('OAUTH_PROVIDER');

/** Будь-яка помилка потоку входу. Текст іде лише в лог, клієнт бачить загальний oauth_failed. */
export class OAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OAuthError';
  }
}
