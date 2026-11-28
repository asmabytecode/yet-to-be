import { Body, Delete, Get, HttpCode, Inject, Param, Patch, Post, Req } from '@nestjs/common';
import {
  type CreateRoleInput,
  createRoleSchema,
  type ListResponse,
  type Permission,
  PERMISSIONS,
  type RoleDto,
  type UpdateRoleInput,
  updateRoleSchema,
} from '@yet-to-be/shared';
import type { Request } from 'express';
import { z } from 'zod';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { AdminController } from '../../platform/admin-controller';
import type { Access } from './access';
import { IamService } from './iam.service';
import { CurrentAccess, RequirePermission, RequireStepUp } from '../../platform/require-permission';

const idSchema = z.uuid();

@AdminController('roles')
export class AdminRolesController {
  constructor(@Inject(IamService) private readonly iam: IamService) {}

  @Get()
  @RequirePermission('roles:read')
  list(): Promise<ListResponse<RoleDto>> {
    return this.iam.listRoles();
  }

  /** Каталог прав для форми ролі. */
  @Get('catalog')
  @RequirePermission('roles:read')
  catalog(): { permissions: readonly Permission[] } {
    return { permissions: PERMISSIONS };
  }

  @Post()
  @RequirePermission('roles:manage')
  create(
    @CurrentAccess() actor: Access,
    @Body(new ZodValidationPipe(createRoleSchema)) input: CreateRoleInput,
    @Req() req: Request,
  ): Promise<RoleDto> {
    return this.iam.createRole(actor, input, req.ip ?? null);
  }

  @Patch(':id')
  @RequirePermission('roles:manage')
  @RequireStepUp()
  update(
    @CurrentAccess() actor: Access,
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Body(new ZodValidationPipe(updateRoleSchema)) input: UpdateRoleInput,
    @Req() req: Request,
  ): Promise<RoleDto> {
    return this.iam.updateRole(actor, id, input, req.ip ?? null);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('roles:manage')
  @RequireStepUp()
  async remove(
    @CurrentAccess() actor: Access,
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Req() req: Request,
  ): Promise<void> {
    await this.iam.deleteRole(actor, id, req.ip ?? null);
  }
}
