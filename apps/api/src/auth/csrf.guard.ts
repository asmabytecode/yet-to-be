import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ERROR_CODES } from '@yet-to-be/shared';
import type { Request } from 'express';
import { AppException } from '../common/app-exception';
import { SKIP_CSRF_KEY } from '../common/decorators';
import { AppConfigService } from '../config/app-config.service';
import { HashingService } from '../infra/crypto/hashing.service';
import { AuthCookies } from './auth-cookies';

export const CSRF_HEADER = 'x-csrf-token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const TRUSTED_FETCH_SITES = new Set(['same-origin', 'same-site', 'none']);

/**
 * Захист від CSRF для методів, що змінюють стан: double-submit (cookie === заголовок),
 * плюс перевірка Origin і Sec-Fetch-Site, коли браузер їх надсилає.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  private readonly allowedOrigin: string;

  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AuthCookies) private readonly cookies: AuthCookies,
    @Inject(HashingService) private readonly hashing: HashingService,
    @Inject(AppConfigService) config: Pick<AppConfigService, 'app'>,
  ) {
    this.allowedOrigin = new URL(config.app.appUrl).origin;
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(req.method)) return true;
    if (
      this.reflector.getAllAndOverride<boolean | undefined>(SKIP_CSRF_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) === true
    ) {
      return true;
    }

    const origin = req.headers.origin;
    if (typeof origin === 'string' && origin !== this.allowedOrigin) throw this.invalid();

    const fetchSite = req.headers['sec-fetch-site'];
    if (typeof fetchSite === 'string' && !TRUSTED_FETCH_SITES.has(fetchSite)) throw this.invalid();

    const cookie = this.cookies.readCsrf(req);
    const header = req.headers[CSRF_HEADER];
    if (
      cookie === undefined ||
      typeof header !== 'string' ||
      !this.hashing.safeEqual(cookie, header)
    ) {
      throw this.invalid();
    }
    return true;
  }

  private invalid(): AppException {
    return new AppException(403, ERROR_CODES.CSRF_INVALID, 'Invalid CSRF token');
  }
}
