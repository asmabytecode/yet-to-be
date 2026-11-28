import { Inject, Injectable } from '@nestjs/common';
import type { EventBlock as EventBlockInput, EventQuery, EventStatus } from '@yet-to-be/shared';
import { isUniqueViolation, UniqueConstraintError } from '../../database/errors';
import { PrismaService } from '../../database/prisma.service';
import type { Event, EventBlock, Prisma } from '../../generated/prisma/client';

export type EventWithBlocks = Event & { blocks: EventBlock[] };
interface Page {
  take: number;
  cursor?: { id: string };
  skip?: number;
}

export type EventWrite = Partial<
  Pick<
    Event,
    | 'title'
    | 'summary'
    | 'description'
    | 'startsAt'
    | 'endsAt'
    | 'timezone'
    | 'venueName'
    | 'address'
    | 'onlineUrl'
    | 'capacity'
    | 'coverAssetId'
    | 'tags'
    | 'status'
    | 'publishedAt'
  >
> & { updatedById: string };

const ORDER: Record<EventQuery['sort'], Prisma.EventOrderByWithRelationInput[]> = {
  startsAt: [{ startsAt: 'asc' }, { id: 'asc' }],
  '-startsAt': [{ startsAt: 'desc' }, { id: 'desc' }],
  createdAt: [{ createdAt: 'asc' }, { id: 'asc' }],
  '-createdAt': [{ createdAt: 'desc' }, { id: 'desc' }],
};

const blockRows = (eventId: string, blocks: readonly EventBlockInput[]) =>
  blocks.map((block, position) => ({
    eventId,
    type: block.type,
    position,
    data: JSON.stringify(block.data),
  }));

@Injectable()
export class EventsRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  find(id: string): Promise<Event | null> {
    return this.prisma.event.findFirst({ where: { id, deletedAt: null } });
  }

  findDetail(id: string): Promise<EventWithBlocks | null> {
    return this.prisma.event.findFirst({
      where: { id, deletedAt: null },
      include: { blocks: { orderBy: { position: 'asc' } } },
    });
  }

  async slugExists(slug: string): Promise<boolean> {
    return (await this.prisma.event.count({ where: { slug } })) > 0;
  }

  async create(
    data: Omit<Prisma.EventUncheckedCreateInput, 'blocks'>,
    blocks: readonly EventBlockInput[] = [],
  ): Promise<Event> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const event = await tx.event.create({ data });
        if (blocks.length > 0) {
          await tx.eventBlock.createMany({ data: blockRows(event.id, blocks) });
        }
        return event;
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new UniqueConstraintError('slug');
      throw error;
    }
  }

  /** Оновлення лише якщо версія збігається; повертає нову подію або null (конфлікт/немає). */
  async updateVersioned(id: string, version: number, data: EventWrite): Promise<Event | null> {
    const { count } = await this.prisma.event.updateMany({
      where: { id, version, deletedAt: null },
      data: { ...data, version: { increment: 1 } },
    });
    return count === 1 ? this.find(id) : null;
  }

  replaceBlocks(
    id: string,
    version: number,
    blocks: readonly EventBlockInput[],
    updatedById: string,
  ): Promise<Event | null> {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.event.updateMany({
        where: { id, version, deletedAt: null },
        data: { updatedById, version: { increment: 1 } },
      });
      if (count === 0) return null;
      await tx.eventBlock.deleteMany({ where: { eventId: id } });
      if (blocks.length > 0) await tx.eventBlock.createMany({ data: blockRows(id, blocks) });
      return tx.event.findUnique({ where: { id } });
    });
  }

  async softDelete(id: string, now: Date, updatedById: string): Promise<boolean> {
    const { count } = await this.prisma.event.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: now, updatedById, version: { increment: 1 } },
    });
    return count === 1;
  }

  list(query: EventQuery, page: Page): Promise<Event[]> {
    const startsAt: { gte?: Date; lte?: Date } = {};
    if (query.from !== undefined) startsAt.gte = new Date(query.from);
    if (query.to !== undefined) startsAt.lte = new Date(query.to);
    const status: EventStatus | undefined = query.status;
    return this.prisma.event.findMany({
      ...page,
      where: {
        deletedAt: null,
        ...(status === undefined ? {} : { status }),
        ...(query.q === undefined ? {} : { title: { contains: query.q } }),
        // Теги зберігаються JSON-масивом: шукаємо точний елемент у лапках.
        ...(query.tag === undefined ? {} : { tags: { contains: `"${query.tag}"` } }),
        ...(Object.keys(startsAt).length === 0 ? {} : { startsAt }),
      },
      orderBy: ORDER[query.sort],
    });
  }

  /** Публічний список: опубліковані події, що ще не закінчились, найближчі спершу. */
  listPublic(filter: { tag?: string | undefined }, now: Date, page: Page): Promise<Event[]> {
    return this.prisma.event.findMany({
      ...page,
      where: {
        deletedAt: null,
        status: 'published',
        endsAt: { gt: now },
        ...(filter.tag === undefined ? {} : { tags: { contains: `"${filter.tag}"` } }),
      },
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
    });
  }

  /** Публічна сторінка: опублікована або скасована (щоб посилання не ламались) подія. */
  findPublicBySlug(slug: string): Promise<EventWithBlocks | null> {
    return this.prisma.event.findFirst({
      where: { slug, deletedAt: null, status: { in: ['published', 'cancelled'] } },
      include: { blocks: { orderBy: { position: 'asc' } } },
    });
  }

  findPublicById(id: string): Promise<Event | null> {
    return this.prisma.event.findFirst({
      where: { id, deletedAt: null, status: { in: ['published', 'cancelled'] } },
    });
  }

  /** Чи посилається жива подія на файл (обкладинка або фото спікера в блоках). */
  async usesAsset(assetId: string): Promise<boolean> {
    const count = await this.prisma.event.count({
      where: {
        deletedAt: null,
        OR: [{ coverAssetId: assetId }, { blocks: { some: { data: { contains: assetId } } } }],
      },
    });
    return count > 0;
  }

  findIdempotent(userId: string, scope: string, key: string): Promise<string | null> {
    return this.prisma.idempotencyKey
      .findUnique({
        where: { userId_scope_key: { userId, scope, key } },
        select: { resultId: true },
      })
      .then((row) => row?.resultId ?? null);
  }

  async saveIdempotent(
    userId: string,
    scope: string,
    key: string,
    resultId: string,
  ): Promise<void> {
    await this.prisma.idempotencyKey.create({ data: { userId, scope, key, resultId } });
  }
}
