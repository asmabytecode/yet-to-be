import { Inject, Injectable } from '@nestjs/common';
import type { RegistrationCancelReason, RegistrationStatus } from '@yet-to-be/shared';
import { isUniqueViolation } from '../../database/errors';
import { PrismaService } from '../../database/prisma.service';
import type { Event, EventRegistration, Prisma } from '../../generated/prisma/client';

export type RegisterOutcome = 'registered' | 'already' | 'full';
interface Page {
  take: number;
  cursor?: { id: string };
  skip?: number;
}
type Tx = Prisma.TransactionClient;

/**
 * Записи на події. Місткість гарантує один атомарний UPDATE з умовою
 * `capacity IS NULL OR registeredCount < capacity` у тій самій транзакції, що й рядок запису:
 * дві паралельні спроби на останнє місце не пройдуть обидві ні в SQLite, ні в PostgreSQL
 * (рядок події блокується UPDATE-ом). Унікальний індекс (eventId, userId) не дає записатися двічі.
 */
@Injectable()
export class RegistrationsRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  find(eventId: string, userId: string): Promise<EventRegistration | null> {
    return this.prisma.eventRegistration.findUnique({
      where: { eventId_userId: { eventId, userId } },
    });
  }

  findById(id: string): Promise<EventRegistration | null> {
    return this.prisma.eventRegistration.findUnique({ where: { id } });
  }

  async register(eventId: string, userId: string): Promise<RegisterOutcome> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.eventRegistration.findUnique({
          where: { eventId_userId: { eventId, userId } },
        });
        if (existing?.status === 'registered') return 'already';
        const seats = await tx.$executeRaw`
          UPDATE "events" SET "registeredCount" = "registeredCount" + 1
          WHERE "id" = ${eventId} AND "deletedAt" IS NULL
            AND ("capacity" IS NULL OR "registeredCount" < "capacity")`;
        if (seats === 0) return 'full';
        if (existing === null) {
          await tx.eventRegistration.create({ data: { eventId, userId } });
        } else {
          await tx.eventRegistration.update({
            where: { id: existing.id },
            data: { status: 'registered', cancelledAt: null, cancelReason: null },
          });
        }
        return 'registered';
      });
    } catch (error) {
      // Паралельний запис того самого користувача: друга транзакція відкочена разом із +1.
      if (isUniqueViolation(error)) return 'already';
      throw error;
    }
  }

  /** Скасувати активний запис і звільнити місце. false — запис уже не активний. */
  cancel(id: string, reason: RegistrationCancelReason, now: Date): Promise<boolean> {
    return this.prisma.$transaction((tx) => this.cancelIn(tx, id, reason, now));
  }

  /** Майбутні активні записи користувача (для скасування при блокуванні акаунта). */
  findUpcomingForUser(userId: string, now: Date): Promise<EventRegistration[]> {
    return this.prisma.eventRegistration.findMany({
      where: { userId, status: 'registered', event: { startsAt: { gt: now } } },
    });
  }

  listForEvent(
    eventId: string,
    filter: { status?: RegistrationStatus },
    page: Page,
  ): Promise<EventRegistration[]> {
    return this.prisma.eventRegistration.findMany({
      ...page,
      where: { eventId, ...(filter.status === undefined ? {} : { status: filter.status }) },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  /** Активні записи користувача на живі (не видалені) події, найближчі спершу. */
  listForUser(userId: string, page: Page): Promise<(EventRegistration & { event: Event })[]> {
    return this.prisma.eventRegistration.findMany({
      ...page,
      where: { userId, status: 'registered', event: { deletedAt: null } },
      include: { event: true },
      orderBy: [{ event: { startsAt: 'asc' } }, { id: 'asc' }],
    });
  }

  private async cancelIn(
    tx: Tx,
    id: string,
    reason: RegistrationCancelReason,
    now: Date,
  ): Promise<boolean> {
    const registration = await tx.eventRegistration.findUnique({ where: { id } });
    if (registration?.status !== 'registered') return false;
    const { count } = await tx.eventRegistration.updateMany({
      where: { id, status: 'registered' },
      data: { status: 'cancelled', cancelledAt: now, cancelReason: reason },
    });
    if (count === 0) return false;
    await tx.$executeRaw`
      UPDATE "events" SET "registeredCount" = "registeredCount" - 1
      WHERE "id" = ${registration.eventId} AND "registeredCount" > 0`;
    return true;
  }
}
