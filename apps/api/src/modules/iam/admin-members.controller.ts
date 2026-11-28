import { Body, Delete, Get, HttpCode, Inject, Param, Post, Query, Req } from '@nestjs/common';
import {
  type GrantRoleInput,
  grantRoleSchema,
  type ListResponse,
  type MemberDto,
  type PaginationQuery,
  paginationQuerySchema,
} from '@yet-to-be/shared';
import type { Request } from 'express';
import { z } from 'zod';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { AdminController } from '../../platform/admin-controller';
import type { Access } from './access';
import { IamService } from './iam.service';
import { CurrentAccess, RequirePermission, RequireStepUp } from '../../platform/require-permission';

const idSchema = z.uuid();

/** Команда адмінки: хто має які ролі. */
@AdminController('members')
export class AdminMembersController {
  constructor(@Inject(IamService) private readonly iam: IamService) {}

  @Get()
  @RequirePermission('roles:read')
  list(
    @Query(new ZodValidationPipe(paginationQuerySchema)) query: PaginationQuery,
  ): Promise<ListResponse<MemberDto>> {
    return this.iam.listMembers(query);
  }

  @Post()
  @HttpCode(204)
  @RequirePermission('roles:manage')
  @RequireStepUp()
  async grant(
    @CurrentAccess() actor: Access,
    @Body(new ZodValidationPipe(grantRoleSchema)) input: GrantRoleInput,
    @Req() req: Request,
  ): Promise<void> {
    await this.iam.grantRole(actor, input, req.ip ?? null);
  }

  @Delete(':userId/roles/:roleId')
  @HttpCode(204)
  @RequirePermission('roles:manage')
  @RequireStepUp()
  async revoke(
    @CurrentAccess() actor: Access,
    @Param('userId', new ZodValidationPipe(idSchema)) userId: string,
    @Param('roleId', new ZodValidationPipe(idSchema)) roleId: string,
    @Req() req: Request,
  ): Promise<void> {
    await this.iam.revokeRole(actor, userId, roleId, req.ip ?? null);
  }
}
