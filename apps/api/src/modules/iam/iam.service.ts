import { Inject, Injectable } from '@nestjs/common';
import {
  type AccessDto,
  type CreateRoleInput,
  ERROR_CODES,
  type GrantRoleInput,
  isPermission,
  type ListResponse,
  type MemberDto,
  type PaginationQuery,
  type Permission,
  type RoleDto,
  type UpdateRoleInput,
} from '@yet-to-be/shared';
import { AppException } from '../../common/app-exception';
import { UniqueConstraintError } from '../../database/errors';
import { UsersRepository } from '../../database/repositories/users.repository';
import { HashingService } from '../../infra/crypto/hashing.service';
import { DomainEventBus } from '../../platform/domain-events';
import { pageArgs, toPage } from '../../platform/pagination';
import { ADMIN_AUDIT, AuditService } from '../audit';
import { type Access, buildAccess } from './access';
import {
  assertCanChangeAssignment,
  assertCanCreateRole,
  assertCanDeleteRole,
  assertCanUpdateRole,
  type RoleShape,
} from './iam.policy';
import {
  type MemberRecord,
  type RoleData,
  type RoleRecord,
  RolesRepository,
} from './roles.repository';

const notFound = (what: string) =>
  new AppException(404, ERROR_CODES.NOT_FOUND, `${what} not found`);

function permissionsOf(role: RoleRecord): Permission[] {
  return role.permissions.map((entry) => entry.permission).filter(isPermission);
}

function shapeOf(role: RoleRecord): RoleShape {
  return { key: role.key, isSystem: role.isSystem, permissions: permissionsOf(role) };
}

function toRoleDto(role: RoleRecord): RoleDto {
  return {
    id: role.id,
    key: role.key,
    name: role.name,
    description: role.description,
    isSystem: role.isSystem,
    requiresMfa: role.requiresMfa,
    permissions: permissionsOf(role).sort(),
    memberCount: role._count.users,
    createdAt: role.createdAt.toISOString(),
  };
}

function toMemberDto(member: MemberRecord): MemberDto {
  return {
    userId: member.id,
    displayName: member.displayName,
    roles: member.roles.map(({ role }) => ({ id: role.id, key: role.key, name: role.name })),
  };
}

/** Ролі, права й призначення. Усі зміни проходять політики антиескалації й пишуться в журнал. */
@Injectable()
export class IamService {
  constructor(
    @Inject(RolesRepository) private readonly roles: RolesRepository,
    @Inject(UsersRepository) private readonly users: UsersRepository,
    @Inject(HashingService) private readonly hashing: HashingService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(DomainEventBus) private readonly events: DomainEventBus,
  ) {}

  async getAccess(userId: string): Promise<Access> {
    return buildAccess(userId, await this.roles.findAccessRows(userId));
  }

  toAccessDto(access: Access): AccessDto {
    return {
      roles: [...access.roleKeys].sort(),
      permissions: [...access.permissions].sort(),
      isOwner: access.isOwner,
    };
  }

  async listRoles(): Promise<ListResponse<RoleDto>> {
    const roles = await this.roles.listRoles();
    return { items: roles.map(toRoleDto), nextCursor: null };
  }

  async createRole(actor: Access, input: CreateRoleInput, ip: string | null): Promise<RoleDto> {
    assertCanCreateRole(actor, input.permissions);
    let role: RoleRecord;
    try {
      role = await this.roles.createRole(
        {
          key: input.key,
          name: input.name,
          description: input.description ?? null,
          requiresMfa: input.requiresMfa,
        },
        input.permissions,
      );
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        throw new AppException(409, ERROR_CODES.CONFLICT, 'Role key is already taken');
      }
      throw error;
    }
    await this.audit.record({
      actorId: actor.userId,
      action: ADMIN_AUDIT.ROLE_CREATE,
      target: { type: 'role', id: role.id },
      metadata: { key: role.key, permissions: permissionsOf(role) },
      ip,
    });
    return toRoleDto(role);
  }

  async updateRole(
    actor: Access,
    roleId: string,
    input: UpdateRoleInput,
    ip: string | null,
  ): Promise<RoleDto> {
    const current = await this.roles.findRole(roleId);
    if (current === null) throw notFound('Role');
    assertCanUpdateRole(actor, shapeOf(current), input.permissions);

    const data: RoleData = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.description !== undefined) data.description = input.description;
    if (input.requiresMfa !== undefined) data.requiresMfa = input.requiresMfa;
    const updated = await this.roles.updateRole(roleId, data, input.permissions);

    await this.audit.record({
      actorId: actor.userId,
      action: ADMIN_AUDIT.ROLE_UPDATE,
      target: { type: 'role', id: roleId },
      metadata: {
        changed: Object.keys(input).sort(),
        before: { permissions: permissionsOf(current), requiresMfa: current.requiresMfa },
        after: { permissions: permissionsOf(updated), requiresMfa: updated.requiresMfa },
      },
      ip,
    });
    await this.events.publish('role.changed', { roleId, actorId: actor.userId });
    return toRoleDto(updated);
  }

  async deleteRole(actor: Access, roleId: string, ip: string | null): Promise<void> {
    const role = await this.roles.findRole(roleId);
    if (role === null) throw notFound('Role');
    assertCanDeleteRole(actor, shapeOf(role));
    if (role._count.users > 0) {
      throw new AppException(409, ERROR_CODES.IAM_ROLE_IN_USE, 'Role is assigned to users');
    }
    await this.roles.deleteRole(roleId);
    await this.audit.record({
      actorId: actor.userId,
      action: ADMIN_AUDIT.ROLE_DELETE,
      target: { type: 'role', id: roleId },
      metadata: { key: role.key },
      ip,
    });
  }

  async listMembers(query: PaginationQuery): Promise<ListResponse<MemberDto>> {
    const rows = await this.roles.listMembers(pageArgs(query));
    return toPage(rows, query.limit, toMemberDto);
  }

  /** Видає роль існуючому користувачу за email. Повторна видача — без помилки. */
  async grantRole(actor: Access, input: GrantRoleInput, ip: string | null): Promise<void> {
    const user = await this.users.findByEmailBlindIndex(this.hashing.blindIndex(input.email));
    if (user === null) throw notFound('User');
    await this.changeAssignment(actor, user.id, input.roleId, 'grant', ip);
  }

  async revokeRole(
    actor: Access,
    userId: string,
    roleId: string,
    ip: string | null,
  ): Promise<void> {
    const user = await this.users.findById(userId);
    if (user === null) throw notFound('User');
    await this.changeAssignment(actor, userId, roleId, 'revoke', ip);
  }

  private async changeAssignment(
    actor: Access,
    userId: string,
    roleId: string,
    kind: 'grant' | 'revoke',
    ip: string | null,
  ): Promise<void> {
    const role = await this.roles.findRole(roleId);
    if (role === null) throw notFound('Role');
    const target = await this.getAccess(userId);
    assertCanChangeAssignment(actor, target, shapeOf(role));

    const changed =
      kind === 'grant'
        ? await this.roles.assign(userId, roleId, actor.userId)
        : await this.roles.unassign(userId, roleId);
    if (!changed) return;

    await this.audit.record({
      actorId: actor.userId,
      action: kind === 'grant' ? ADMIN_AUDIT.ROLE_GRANT : ADMIN_AUDIT.ROLE_REVOKE,
      target: { type: 'user', id: userId },
      metadata: { roleId, roleKey: role.key },
      ip,
    });
    await this.events.publish('role.changed', { roleId, actorId: actor.userId });
  }
}
