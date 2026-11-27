import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  type ChangePasswordInput,
  changePasswordSchema,
  type SessionInfo,
  type SetPasswordInput,
  setPasswordSchema,
  type UpdateProfileInput,
  updateProfileSchema,
  type UserDto,
} from '@yet-to-be/shared';
import type { Request } from 'express';
import { z } from 'zod';
import { CurrentUser } from '../common/decorators';
import { type AuthUser, clientContext } from '../common/request-context';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { UsersService } from './users.service';

const PASSWORD_LIMIT = { default: { limit: 5, ttl: 15 * 60_000 } };
const idSchema = z.uuid();

/** Усі маршрути — тільки /me: id користувача береться з токена, а не з URL. */
@Controller('users/me')
export class UsersController {
  constructor(@Inject(UsersService) private readonly users: UsersService) {}

  @Get()
  me(@CurrentUser() user: AuthUser): Promise<UserDto> {
    return this.users.getDto(user.id);
  }

  @Patch()
  update(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(updateProfileSchema)) body: UpdateProfileInput,
    @Req() req: Request,
  ): Promise<UserDto> {
    return this.users.updateProfile(user.id, body, clientContext(req));
  }

  @Throttle(PASSWORD_LIMIT)
  @HttpCode(204)
  @Put('password')
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(changePasswordSchema)) body: ChangePasswordInput,
    @Req() req: Request,
  ): Promise<void> {
    await this.users.changePassword(user.id, user.sessionId, body, clientContext(req));
  }

  @Throttle(PASSWORD_LIMIT)
  @HttpCode(204)
  @Post('password')
  async setPassword(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(setPasswordSchema)) body: SetPasswordInput,
    @Req() req: Request,
  ): Promise<void> {
    await this.users.setPassword(user.id, body, clientContext(req));
  }

  @HttpCode(204)
  @Delete('oauth/google')
  async unlinkGoogle(@CurrentUser() user: AuthUser, @Req() req: Request): Promise<void> {
    await this.users.unlinkGoogle(user.id, clientContext(req));
  }

  @Get('sessions')
  sessions(@CurrentUser() user: AuthUser): Promise<SessionInfo[]> {
    return this.users.listSessions(user.id, user.sessionId);
  }

  @HttpCode(204)
  @Delete('sessions/:id')
  async revokeSession(
    @CurrentUser() user: AuthUser,
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Req() req: Request,
  ): Promise<void> {
    await this.users.revokeSession(user.id, id, clientContext(req));
  }
}
