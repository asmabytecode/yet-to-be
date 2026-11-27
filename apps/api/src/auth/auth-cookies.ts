import { Inject, Injectable } from '@nestjs/common';
import type { CookieOptions, Request, Response } from 'express';
import { AppConfigService } from '../config/app-config.service';
import { ttlToSeconds } from './ttl';

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
  readonly names: { access: string; refresh: string; csrf: string };
  private readonly secure: boolean;
  private readonly accessMaxAgeMs: number;
  private readonly refreshMaxAgeMs: number;
  private readonly refreshPath: string;

  constructor(@Inject(AppConfigService) config: Pick<AppConfigService, 'app' | 'auth' | 'isProd'>) {
    this.secure = config.isProd;
    this.names = config.isProd
      ? { access: '__Host-ytb_at', refresh: '__Secure-ytb_rt', csrf: '__Host-ytb_csrf' }
      : { access: 'ytb_at', refresh: 'ytb_rt', csrf: 'ytb_csrf' };
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
