import { Body, Get, HttpCode, Inject, Param, Post, Query, Req } from '@nestjs/common';
import {
  type AdminUserDetailDto,
  type AdminUserDto,
  type AdminUserQuery,
  adminUserQuerySchema,
  type BlockUserInput,
  blockUserSchema,
  type ListResponse,
} from '@yet-to-be/shared';
import type { Request } from 'express';
import { z } from 'zod';
import { CurrentUser } from '../../common/decorators';
import type { AuthUser } from '../../common/request-context';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { AdminController } from '../../platform/admin-controller';
import { CurrentAccess, RequirePermission } from '../../platform/require-permission';
import type { Access } from './access';
import { type ActorContext, UserAdminService } from './user-admin.service';

const idSchema = z.uuid();

function actorOf(access: Access, user: AuthUser, req: Request): ActorContext {
  return { access, sessionId: user.sessionId, ip: req.ip ?? null };
}

@AdminController('users')
export class AdminUsersController {
  constructor(@Inject(UserAdminService) private readonly users: UserAdminService) {}

  @Get()
  @RequirePermission('users:read')
  list(
    @Query(new ZodValidationPipe(adminUserQuerySchema)) query: AdminUserQuery,
  ): Promise<ListResponse<AdminUserDto>> {
    return this.users.list(query);
  }

  @Get(':id')
  @RequirePermission('users:read')
  detail(
    @CurrentAccess() access: Access,
    @CurrentUser() user: AuthUser,
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Req() req: Request,
  ): Promise<AdminUserDetailDto> {
    return this.users.detail(actorOf(access, user, req), id);
  }

  /** Ідемпотентно: повторне блокування не змінює причину й час. */
  @Post(':id/block')
  @HttpCode(204)
  @RequirePermission('users:block')
  async block(
    @CurrentAccess() access: Access,
    @CurrentUser() user: AuthUser,
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Body(new ZodValidationPipe(blockUserSchema)) input: BlockUserInput,
    @Req() req: Request,
  ): Promise<void> {
    await this.users.block(actorOf(access, user, req), id, input.reason);
  }

  @Post(':id/unblock')
  @HttpCode(204)
  @RequirePermission('users:block')
  async unblock(
    @CurrentAccess() access: Access,
    @CurrentUser() user: AuthUser,
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Req() req: Request,
  ): Promise<void> {
    await this.users.unblock(actorOf(access, user, req), id);
  }
}
