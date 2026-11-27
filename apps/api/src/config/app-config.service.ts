import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from './env.schema';

/**
 * Типізований доступ до конфігурації. Єдине місце, звідки решта коду читає налаштування —
 * `process.env` напряму не використовується.
 */
@Injectable()
export class AppConfigService {
  constructor(@Inject(ConfigService) private readonly config: ConfigService<Env, true>) {}

  get isProd(): boolean {
    return this.config.get('NODE_ENV', { infer: true }) === 'production';
  }

  get app() {
    return {
      nodeEnv: this.config.get('NODE_ENV', { infer: true }),
      port: this.config.get('API_PORT', { infer: true }),
      apiPrefix: this.config.get('API_PREFIX', { infer: true }),
      appUrl: this.config.get('APP_URL', { infer: true }),
      trustProxy: this.config.get('TRUST_PROXY', { infer: true }),
      throttleDisabled: this.config.get('THROTTLE_DISABLED', { infer: true }),
    };
  }

  /** Cookies з атрибутом Secure (і префіксами __Host-/__Secure-) — лише коли застосунок відкрито по https. */
  get secureCookies(): boolean {
    return new URL(this.config.get('APP_URL', { infer: true })).protocol === 'https:';
  }

  get database() {
    return { url: this.config.get('DATABASE_URL', { infer: true }) };
  }

  get auth() {
    return {
      jwtAccessSecret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
      jwtAccessTtl: this.config.get('JWT_ACCESS_TTL', { infer: true }),
      jwtIssuer: this.config.get('JWT_ISSUER', { infer: true }),
      jwtAudience: this.config.get('JWT_AUDIENCE', { infer: true }),
      refreshTokenTtlDays: this.config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true }),
      passwordPepper: this.config.get('PASSWORD_PEPPER', { infer: true }),
      cookieSecret: this.config.get('COOKIE_SECRET', { infer: true }),
    };
  }

  get crypto() {
    return {
      keys: this.config.get('DATA_ENCRYPTION_KEYS', { infer: true }),
      activeKeyId: this.config.get('DATA_ENCRYPTION_ACTIVE_KEY_ID', { infer: true }),
      blindIndexKey: this.config.get('BLIND_INDEX_KEY', { infer: true }),
    };
  }

  get google() {
    return {
      clientId: this.config.get('GOOGLE_CLIENT_ID', { infer: true }),
      clientSecret: this.config.get('GOOGLE_CLIENT_SECRET', { infer: true }),
      callbackUrl: this.config.get('GOOGLE_CALLBACK_URL', { infer: true }),
      mock: this.config.get('OAUTH_MOCK', { infer: true }),
    };
  }
}
