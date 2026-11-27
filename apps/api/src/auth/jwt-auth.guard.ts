import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ERROR_CODES } from '@yet-to-be/shared';
import { AppException } from '../common/app-exception';
import { IS_PUBLIC_KEY } from '../common/decorators';
import type { AppRequest } from '../common/request-context';
import { SessionsRepository } from '../database/repositories/sessions.repository';
import { AuthCookies } from './auth-cookies';
import { TokenService } from './token.service';

/**
 * Глобальний guard: усе закрито, якщо не позначено @Public(). Перевіряє підпис JWT і
 * те, що сесія досі активна, тому logout відкликає доступ одразу, а не після закінчення TTL.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AuthCookies) private readonly cookies: AuthCookies,
    @Inject(TokenService) private readonly tokens: TokenService,
    @Inject(SessionsRepository) private readonly sessions: SessionsRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic === true) return true;

    const req = context.switchToHttp().getRequest<AppRequest>();
    const token = this.cookies.readAccess(req);
    const claims = token === undefined ? null : this.tokens.verifyAccess(token);
    if (claims === null) throw this.unauthorized();

    const session = await this.sessions.findActiveById(claims.sessionId, new Date());
    if (session?.userId !== claims.userId) throw this.unauthorized();

    req.user = { id: claims.userId, sessionId: claims.sessionId };
    return true;
  }

  private unauthorized(): AppException {
    return new AppException(401, ERROR_CODES.UNAUTHORIZED, 'Authentication required');
  }
}
