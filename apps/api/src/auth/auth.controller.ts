import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  type CsrfResponse,
  ERROR_CODES,
  type LoginInput,
  loginSchema,
  type RegisterInput,
  registerSchema,
  type UserDto,
} from '@yet-to-be/shared';
import type { Request, Response } from 'express';
import { AppException } from '../common/app-exception';
import { CurrentUser, Public } from '../common/decorators';
import { type AuthUser, clientContext } from '../common/request-context';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { HashingService } from '../infra/crypto/hashing.service';
import { AuthCookies } from './auth-cookies';
import { AuthService, type AuthResult } from './auth.service';

const AUTH_LIMIT = { default: { limit: 10, ttl: 60_000 } };

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(AuthCookies) private readonly cookies: AuthCookies,
    @Inject(HashingService) private readonly hashing: HashingService,
  ) {}

  /** Видає CSRF-токен (якщо cookie вже є — повертає наявний). Викликається перед формами входу. */
  @Public()
  @Get('csrf')
  csrf(@Req() req: Request, @Res({ passthrough: true }) res: Response): CsrfResponse {
    const existing = this.cookies.readCsrf(req);
    const csrfToken = existing ?? this.hashing.randomToken(32);
    if (existing === undefined) this.cookies.setCsrf(res, csrfToken);
    return { csrfToken };
  }

  @Public()
  @Throttle(AUTH_LIMIT)
  @Post('register')
  async register(
    @Body(new ZodValidationPipe(registerSchema)) body: RegisterInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: UserDto }> {
    return this.respond(res, await this.auth.register(body, clientContext(req)));
  }

  @Public()
  @Throttle(AUTH_LIMIT)
  @HttpCode(200)
  @Post('login')
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: UserDto }> {
    return this.respond(res, await this.auth.login(body, clientContext(req)));
  }

  @Public()
  @Throttle(AUTH_LIMIT)
  @HttpCode(200)
  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: UserDto }> {
    const token = this.cookies.readRefresh(req);
    if (token === undefined) {
      this.cookies.clearSession(res);
      throw new AppException(401, ERROR_CODES.AUTH_SESSION_EXPIRED, 'Session expired');
    }
    try {
      return this.respond(res, await this.auth.refresh(token, clientContext(req)));
    } catch (error) {
      this.cookies.clearSession(res);
      throw error;
    }
  }

  @Public()
  @HttpCode(204)
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logout(this.cookies.readRefresh(req), clientContext(req));
    this.cookies.clearSession(res);
  }

  @HttpCode(204)
  @Post('logout-all')
  async logoutAll(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logoutAll(user.id, clientContext(req));
    this.cookies.clearSession(res);
  }

  @Get('session')
  async session(@CurrentUser() user: AuthUser): Promise<{ user: UserDto }> {
    return { user: await this.auth.getUser(user.id) };
  }

  private respond(res: Response, result: AuthResult): { user: UserDto } {
    this.cookies.setSession(res, result.tokens);
    return { user: result.user };
  }
}
