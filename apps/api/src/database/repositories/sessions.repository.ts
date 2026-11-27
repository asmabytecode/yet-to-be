import { Inject, Injectable } from '@nestjs/common';
import type { Session } from '../../generated/prisma/client';
import { isNotFound, isUniqueViolation, RecordNotFoundError, UniqueConstraintError } from '../errors';
import { PrismaService } from '../prisma.service';

export interface CreateSessionInput {
  userId: string;
  /** Спільний id ланцюжка ротацій. */
  familyId: string;
  /** SHA-256 refresh-токена; відкритий токен у БД не потрапляє. */
  refreshTokenHash: string;
  expiresAt: Date;
  userAgent: string | null;
  ipHash: string | null;
}

/** Refresh-сесії з ротацією та відкликанням. Час передається явно — це спрощує тести. */
@Injectable()
export class SessionsRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async create(input: CreateSessionInput): Promise<Session> {
    try {
      return await this.prisma.session.create({ data: input });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new UniqueConstraintError('refreshTokenHash');
      }
      throw error;
    }
  }

  findByTokenHash(refreshTokenHash: string): Promise<Session | null> {
    return this.prisma.session.findUnique({ where: { refreshTokenHash } });
  }

  /** Активна сесія: не відкликана й не прострочена. Використовується guard-ом access-токена. */
  findActiveById(id: string, now: Date): Promise<Session | null> {
    return this.prisma.session.findFirst({
      where: { id, revokedAt: null, expiresAt: { gt: now } },
    });
  }

  /**
   * Атомарно замінює стару сесію новою: створює нову, а стару позначає відкликаною
   * з посиланням на заміну. Якщо стара сесія не існує — транзакція відкочується.
   */
  async rotate(oldSessionId: string, next: CreateSessionInput, now: Date): Promise<Session> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const created = await tx.session.create({ data: next });
        await tx.session.update({
          where: { id: oldSessionId },
          data: { revokedAt: now, replacedById: created.id },
        });
        return created;
      });
    } catch (error) {
      if (isNotFound(error)) {
        throw new RecordNotFoundError('Session');
      }
      if (isUniqueViolation(error)) {
        throw new UniqueConstraintError('refreshTokenHash');
      }
      throw error;
    }
  }

  /** Відкликає одну сесію (якщо вона ще активна). Повертає true, якщо щось змінилось. */
  async revoke(id: string, now: Date): Promise<boolean> {
    const { count } = await this.prisma.session.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: now },
    });
    return count > 0;
  }

  /** Відкликає весь ланцюжок ротацій (реакція на повторне використання refresh-токена). */
  async revokeFamily(familyId: string, now: Date): Promise<number> {
    const { count } = await this.prisma.session.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: now },
    });
    return count;
  }

  /** Відкликає всі сесії користувача ("вийти скрізь", зміна пароля). */
  async revokeAllForUser(userId: string, now: Date): Promise<number> {
    const { count } = await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now },
    });
    return count;
  }

  /** Відкликає всі сесії користувача, крім поточної (зміна пароля). */
  async revokeOthersForUser(userId: string, exceptSessionId: string, now: Date): Promise<number> {
    const { count } = await this.prisma.session.updateMany({
      where: { userId, revokedAt: null, id: { not: exceptSessionId } },
      data: { revokedAt: now },
    });
    return count;
  }

  listActiveForUser(userId: string, now: Date): Promise<Session[]> {
    return this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Прибирає прострочені сесії. Повертає кількість видалених. */
  async deleteExpired(now: Date): Promise<number> {
    const { count } = await this.prisma.session.deleteMany({ where: { expiresAt: { lt: now } } });
    return count;
  }
}
