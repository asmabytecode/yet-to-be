import { Inject, Injectable } from '@nestjs/common';
import type { UserStatus } from '@yet-to-be/shared';
import { PrismaService } from '../../database/prisma.service';
import type { Prisma, User } from '../../generated/prisma/client';

export interface UserFilter {
  status?: UserStatus;
  roleKey?: string;
  displayNamePrefix?: string;
  emailBlindIndex?: string;
}

const listSelect = {
  id: true,
  displayName: true,
  status: true,
  createdAt: true,
  lastLoginAt: true,
  blockedAt: true,
  roles: { select: { role: { select: { key: true } } } },
} satisfies Prisma.UserSelect;

export type UserListRecord = Prisma.UserGetPayload<{ select: typeof listSelect }>;
type Tx = Prisma.TransactionClient;

/** Запити адмінки до користувачів. Блокування — разом із відкликанням сесій в одній транзакції. */
@Injectable()
export class UserAdminRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  list(
    filter: UserFilter,
    page: { take: number; cursor?: { id: string }; skip?: number },
  ): Promise<UserListRecord[]> {
    return this.prisma.user.findMany({
      ...page,
      where: {
        ...(filter.status === undefined ? {} : { status: filter.status }),
        ...(filter.roleKey === undefined
          ? {}
          : { roles: { some: { role: { key: filter.roleKey } } } }),
        ...(filter.displayNamePrefix === undefined
          ? {}
          : { displayName: { startsWith: filter.displayNamePrefix } }),
        ...(filter.emailBlindIndex === undefined
          ? {}
          : { emailBlindIndex: filter.emailBlindIndex }),
      },
      orderBy: { id: 'asc' },
      select: listSelect,
    });
  }

  findById(id: string): Promise<(User & { roles: { role: { key: string } }[] }) | null> {
    return this.prisma.user.findUnique({
      where: { id },
      include: { roles: { select: { role: { select: { key: true } } } } },
    });
  }

  async hasMfa(userId: string): Promise<boolean> {
    const row = await this.prisma.userMfa.findUnique({
      where: { userId },
      select: { enabledAt: true },
    });
    return row?.enabledAt != null;
  }

  /**
   * Блокує (якщо ще активний) і відкликає всі сесії. `onChanged` виконується в тій самій
   * транзакції — туди передається запис журналу. Повертає false, якщо вже заблоковано.
   */
  block(
    userId: string,
    change: { actorId: string; reason: string; now: Date },
    onChanged: (tx: Tx) => Promise<void>,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.user.updateMany({
        where: { id: userId, status: 'active' },
        data: {
          status: 'blocked',
          blockedAt: change.now,
          blockedById: change.actorId,
          blockReason: change.reason,
        },
      });
      if (count === 0) return false;
      await tx.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: change.now },
      });
      await onChanged(tx);
      return true;
    });
  }

  unblock(userId: string, onChanged: (tx: Tx) => Promise<void>): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.user.updateMany({
        where: { id: userId, status: 'blocked' },
        data: { status: 'active', blockedAt: null, blockedById: null, blockReason: null },
      });
      if (count === 0) return false;
      await onChanged(tx);
      return true;
    });
  }
}
