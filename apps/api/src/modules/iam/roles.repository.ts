import { Inject, Injectable } from '@nestjs/common';
import type { Permission } from '@yet-to-be/shared';
import { isUniqueViolation, UniqueConstraintError } from '../../database/errors';
import { PrismaService } from '../../database/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import type { AccessRow } from './access';
import { OWNER_ROLE_ID } from './iam.constants';

const roleInclude = {
  permissions: true,
  _count: { select: { users: true } },
} satisfies Prisma.RoleInclude;

export type RoleRecord = Prisma.RoleGetPayload<{ include: typeof roleInclude }>;

export interface RoleData {
  name?: string;
  description?: string | null;
  requiresMfa?: boolean;
}

export interface MemberRecord {
  id: string;
  displayName: string;
  roles: { role: { id: string; key: string; name: string } }[];
}

/** Доступ до таблиць ролей. Політики й аудит — у IamService, не тут. */
@Injectable()
export class RolesRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  findAccessRows(userId: string): Promise<AccessRow[]> {
    return this.prisma.userRole.findMany({
      where: { userId },
      select: {
        role: {
          select: { key: true, requiresMfa: true, permissions: { select: { permission: true } } },
        },
      },
    });
  }

  listRoles(): Promise<RoleRecord[]> {
    return this.prisma.role.findMany({
      include: roleInclude,
      orderBy: [{ isSystem: 'desc' }, { createdAt: 'asc' }],
    });
  }

  findRole(id: string): Promise<RoleRecord | null> {
    return this.prisma.role.findUnique({ where: { id }, include: roleInclude });
  }

  async createRole(
    data: { key: string; name: string; description: string | null; requiresMfa: boolean },
    permissions: readonly Permission[],
  ): Promise<RoleRecord> {
    try {
      return await this.prisma.role.create({
        data: {
          ...data,
          permissions: { create: permissions.map((permission) => ({ permission })) },
        },
        include: roleInclude,
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new UniqueConstraintError('key');
      throw error;
    }
  }

  /** Оновлення ролі; набір прав замінюється повністю в тій самій транзакції. */
  updateRole(
    id: string,
    data: RoleData,
    permissions: readonly Permission[] | undefined,
  ): Promise<RoleRecord> {
    return this.prisma.$transaction(async (tx) => {
      if (permissions !== undefined) {
        await tx.rolePermission.deleteMany({ where: { roleId: id } });
        await tx.rolePermission.createMany({
          data: permissions.map((permission) => ({ roleId: id, permission })),
        });
      }
      return tx.role.update({ where: { id }, data, include: roleInclude });
    });
  }

  async deleteRole(id: string): Promise<void> {
    await this.prisma.role.delete({ where: { id } });
  }

  /** Ідемпотентно: повторна видача не створює дубля й повертає false. */
  async assign(userId: string, roleId: string, grantedById: string | null): Promise<boolean> {
    try {
      await this.prisma.userRole.create({ data: { userId, roleId, grantedById } });
      return true;
    } catch (error) {
      if (isUniqueViolation(error)) return false;
      throw error;
    }
  }

  async unassign(userId: string, roleId: string): Promise<boolean> {
    const { count } = await this.prisma.userRole.deleteMany({ where: { userId, roleId } });
    return count > 0;
  }

  async findOwnerUserId(): Promise<string | null> {
    const row = await this.prisma.userRole.findFirst({
      where: { roleId: OWNER_ROLE_ID },
      select: { userId: true },
    });
    return row?.userId ?? null;
  }

  /** Користувачі, що мають хоча б одну роль (команда адмінки). */
  listMembers(args: {
    take: number;
    cursor?: { id: string };
    skip?: number;
  }): Promise<MemberRecord[]> {
    return this.prisma.user.findMany({
      ...args,
      where: { roles: { some: {} } },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        displayName: true,
        roles: { select: { role: { select: { id: true, key: true, name: true } } } },
      },
    });
  }
}
