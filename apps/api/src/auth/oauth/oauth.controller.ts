import { Controller, Get, Inject, Logger, Query, Req, Res } from '@nestjs/common';
import { ERROR_CODES } from '@yet-to-be/shared';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AppException } from '../../common/app-exception';
import { Public } from '../../common/decorators';
import { clientContext } from '../../common/request-context';
import { AppConfigService } from '../../config/app-config.service';
import { AuthCookies } from '../auth-cookies';
import { OAuthService } from './oauth.service';

const OAUTH_LIMIT = { default: { limit: 20, ttl: 60_000 } };
const FAILURE_PATH = '/login?error=oauth_failed';
const STATE_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
/** Сторінка згоди mock-провайдера: без скриптів і стилів, форма лише на той самий origin. */
const MOCK_CONSENT_CSP =
  "default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'";

/** Потік входу через Google. Обидва маршрути — GET, тому CSRF-перевірка їх не стосується. */
@Controller('auth/google')
export class OAuthController {
  private readonly logger = new Logger(OAuthController.name);

  constructor(
    @Inject(OAuthService) private readonly oauth: OAuthService,
    @Inject(AuthCookies) private readonly cookies: AuthCookies,
    @Inject(AppConfigService) private readonly config: Pick<AppConfigService, 'app' | 'google'>,
  ) {}

  @Public()
  @Throttle(OAUTH_LIMIT)
  @Get()
  start(@Query('returnTo') returnTo: unknown, @Res() res: Response): void {
    const { url, transaction } = this.oauth.start(returnTo);
    this.cookies.setOAuthTransaction(res, transaction);
    res.redirect(302, url);
  }

  @Public()
  @Throttle(OAUTH_LIMIT)
  @Get('callback')
  async callback(
    @Query() query: Record<string, unknown>,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const transaction = this.cookies.readOAuthTransaction(req);
    this.cookies.clearOAuthTransaction(res);
    try {
      const { result, returnTo } = await this.oauth.complete(
        query,
        transaction,
        clientContext(req),
      );
      this.cookies.setSession(res, result.tokens);
      res.redirect(302, this.absolute(returnTo));
    } catch (error) {
      // Деталі — лише в лог; у URL — тільки загальний код.
      this.logger.warn(
        `Google sign-in failed: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      res.redirect(302, this.absolute(FAILURE_PATH));
    }
  }

  /**
   * Лише для E2E (OAUTH_MOCK=true): імітація екрана згоди Google. В інших режимах маршрут
   * відповідає 404, ніби його немає.
   */
  @Public()
  @Throttle(OAUTH_LIMIT)
  @Get('mock-consent')
  mockConsent(@Query('state') state: unknown, @Res() res: Response): void {
    if (!this.config.google.mock) {
      throw new AppException(404, ERROR_CODES.NOT_FOUND, 'Not found');
    }
    if (typeof state !== 'string' || !STATE_PATTERN.test(state)) {
      throw new AppException(400, ERROR_CODES.BAD_REQUEST, 'Invalid state');
    }
    const action = `/${this.config.app.apiPrefix}/v1/auth/google/callback`;
    res.setHeader('Content-Security-Policy', MOCK_CONSENT_CSP);
    res.type('html').send(
      [
        '<!doctype html>',
        '<html lang="en"><head><meta charset="utf-8"><title>Mock Google sign-in</title></head><body>',
        '<h1>Mock Google sign-in</h1>',
        '<p>E2E only. Real Google is not contacted.</p>',
        `<form method="get" action="${action}">`,
        // state перевірено регулярним виразом вище, тому безпечно вставляти в атрибут.
        `<input type="hidden" name="state" value="${state}">`,
        '<label for="code">Email</label> <input id="code" name="code" type="email" required>',
        '<button type="submit">Continue</button>',
        '</form></body></html>',
      ].join(''),
    );
  }

  private absolute(path: string): string {
    return new URL(path, this.config.app.appUrl).toString();
  }
}
