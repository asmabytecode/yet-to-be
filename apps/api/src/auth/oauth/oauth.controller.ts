import { Controller, Get, Inject, Logger, Query, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Public } from '../../common/decorators';
import { clientContext } from '../../common/request-context';
import { AppConfigService } from '../../config/app-config.service';
import { AuthCookies } from '../auth-cookies';
import { OAuthService } from './oauth.service';

const OAUTH_LIMIT = { default: { limit: 20, ttl: 60_000 } };
const FAILURE_PATH = '/login?error=oauth_failed';

/** Потік входу через Google. Обидва маршрути — GET, тому CSRF-перевірка їх не стосується. */
@Controller('auth/google')
export class OAuthController {
  private readonly logger = new Logger(OAuthController.name);

  constructor(
    @Inject(OAuthService) private readonly oauth: OAuthService,
    @Inject(AuthCookies) private readonly cookies: AuthCookies,
    @Inject(AppConfigService) private readonly config: Pick<AppConfigService, 'app'>,
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
      const { result, returnTo } = await this.oauth.complete(query, transaction, clientContext(req));
      this.cookies.setSession(res, result.tokens);
      res.redirect(302, this.absolute(returnTo));
    } catch (error) {
      // Деталі — лише в лог; у URL — тільки загальний код.
      this.logger.warn(`Google sign-in failed: ${error instanceof Error ? error.message : 'unknown'}`);
      res.redirect(302, this.absolute(FAILURE_PATH));
    }
  }

  private absolute(path: string): string {
    return new URL(path, this.config.app.appUrl).toString();
  }
}
