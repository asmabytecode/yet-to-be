import { Inject, Injectable } from '@nestjs/common';
import type { CookieOptions, Request, Response } from 'express';
import { z } from 'zod';
import { AppConfigService } from '../config/app-config.service';
import type { OAuthTransaction } from './oauth/oauth-provider';
import { ttlToSeconds } from './ttl';

const OAUTH_TTL_MS = 10 * 60_000;
const transactionSchema = z.object({
  state: z.string().min(1),
  nonce: z.string().min(1),
  codeVerifier: z.string().min(1),
  returnTo: z.string(),
});

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
}

/**
 * Cookies сесії. Access і refresh — httpOnly (JS не бачить), CSRF-токен — читається JS
 * і дублюється в заголовку (double-submit). У production імена мають префікси __Host-/__Secure-.
 */
@Injectable()
export class AuthCookies {
  readonly names: { access: string; refresh: string; csrf: string; oauth: string };
  private readonly secure: boolean;
  private readonly accessMaxAgeMs: number;
  private readonly refreshMaxAgeMs: number;
  private readonly refreshPath: string;

  constructor(@Inject(AppConfigService) config: Pick<AppConfigService, 'app' | 'auth' | 'isProd'>) {
    this.secure = config.isProd;
    this.names = config.isProd
      ? { access: '__Host-ytb_at', refresh: '__Secure-ytb_rt', csrf: '__Host-ytb_csrf', oauth: '__Host-yt_oauth' }
      : { access: 'ytb_at', refresh: 'ytb_rt', csrf: 'ytb_csrf', oauth: 'yt_oauth' };
    this.accessMaxAgeMs = ttlToSeconds(config.auth.jwtAccessTtl) * 1000;
    this.refreshMaxAgeMs = config.auth.refreshTokenTtlDays * 86_400_000;
    // Refresh-cookie надсилається браузером лише на auth-маршрути.
    this.refreshPath = `/${config.app.apiPrefix}/v1/auth`;
  }

  setSession(res: Response, tokens: SessionTokens): void {
    res.cookie(this.names.access, tokens.accessToken, {
      ...this.base(true),
      path: '/',
      maxAge: this.accessMaxAgeMs,
    });
    res.cookie(this.names.refresh, tokens.refreshToken, {
      ...this.base(true),
      path: this.refreshPath,
      maxAge: this.refreshMaxAgeMs,
    });
    this.setCsrf(res, tokens.csrfToken);
  }

  setCsrf(res: Response, csrfToken: string): void {
    res.cookie(this.names.csrf, csrfToken, {
      ...this.base(false),
      path: '/',
      maxAge: this.refreshMaxAgeMs,
    });
  }

  clearSession(res: Response): void {
    res.clearCookie(this.names.access, { ...this.base(true), path: '/' });
    res.clearCookie(this.names.refresh, { ...this.base(true), path: this.refreshPath });
    res.clearCookie(this.names.csrf, { ...this.base(false), path: '/' });
  }

  /**
   * Тимчасова cookie потоку Google: підписана (COOKIE_SECRET), httpOnly, 10 хв.
   * SameSite=Lax, а не Strict: інакше браузер не надішле її при поверненні з Google.
   */
  setOAuthTransaction(res: Response, transaction: OAuthTransaction): void {
    res.cookie(this.names.oauth, JSON.stringify(transaction), {
      httpOnly: true,
      secure: this.secure,
      sameSite: 'lax',
      signed: true,
      path: '/',
      maxAge: OAUTH_TTL_MS,
    });
  }

  readOAuthTransaction(req: Request): OAuthTransaction | undefined {
    const signed = req.signedCookies as Record<string, unknown> | undefined;
    const raw = signed?.[this.names.oauth];
    if (typeof raw !== 'string') return undefined;
    try {
      const parsed = transactionSchema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : undefined;
    } catch {
      return undefined;
    }
  }

  clearOAuthTransaction(res: Response): void {
    res.clearCookie(this.names.oauth, {
      httpOnly: true,
      secure: this.secure,
      sameSite: 'lax',
      path: '/',
    });
  }

  readAccess(req: Request): string | undefined {
    return this.read(req, this.names.access);
  }

  readRefresh(req: Request): string | undefined {
    return this.read(req, this.names.refresh);
  }

  readCsrf(req: Request): string | undefined {
    return this.read(req, this.names.csrf);
  }

  private read(req: Request, name: string): string | undefined {
    const cookies = req.cookies as Record<string, unknown> | undefined;
    const value = cookies?.[name];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  private base(httpOnly: boolean): CookieOptions {
    return { httpOnly, secure: this.secure, sameSite: 'strict' };
  }
}
