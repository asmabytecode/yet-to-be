import { Inject, Injectable } from '@nestjs/common';
import {
  ERROR_CODES,
  type ListResponse,
  type PublicEventBlock,
  type PublicEventDto,
  type PublicEventQuery,
  type PublicEventSummary,
  type PublicImage,
} from '@yet-to-be/shared';
import { AppException } from '../../common/app-exception';
import type { Event } from '../../generated/prisma/client';
import { CLOCK, type Clock } from '../../platform/clock';
import { pageArgs, toPage } from '../../platform/pagination';
import { MediaService } from '../media';
import { EventsRepository } from './events.repository';
import { EventsService, parseTags } from './events.service';

const notFound = () => new AppException(404, ERROR_CODES.NOT_FOUND, 'Event not found');

/** Скільки місць лишилось; null — без обмежень. */
export function spotsLeft(event: Pick<Event, 'capacity' | 'registeredCount'>): number | null {
  return event.capacity === null ? null : Math.max(0, event.capacity - event.registeredCount);
}

/** Запис відкритий: подія опублікована, ще не почалась і має вільні місця. */
export function registrationOpen(event: Event, now: Date): boolean {
  const left = spotsLeft(event);
  return event.status === 'published' && event.startsAt > now && (left === null || left > 0);
}

/**
 * Публічне представлення подій: лише поля для відвідувачів, id файлів замінено на URL готових
 * варіантів. Чернетки, архів і видалені події сюди не потрапляють (фільтр у репозиторії).
 */
@Injectable()
export class PublicEventsService {
  constructor(
    @Inject(EventsRepository) private readonly repository: EventsRepository,
    @Inject(EventsService) private readonly events: EventsService,
    @Inject(MediaService) private readonly media: MediaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(query: PublicEventQuery): Promise<ListResponse<PublicEventSummary>> {
    const rows = await this.repository.listPublic(
      { tag: query.tag },
      this.clock.now(),
      pageArgs(query),
    );
    const page = toPage(rows, query.limit, (row) => row);
    return { items: await this.summaries(page.items), nextCursor: page.nextCursor };
  }

  async get(slug: string): Promise<PublicEventDto> {
    const event = await this.repository.findPublicBySlug(slug);
    if (event === null) throw notFound();
    const blocks = this.events.parseBlocks(event.blocks);
    const photoIds = blocks.flatMap((block) =>
      block.type === 'speaker' && block.data.photoAssetId !== undefined
        ? [block.data.photoAssetId]
        : [],
    );
    const images = await this.media.publicImages([
      ...(event.coverAssetId === null ? [] : [event.coverAssetId]),
      ...photoIds,
    ]);
    const image = (id: string | null | undefined): PublicImage | null =>
      id === null || id === undefined ? null : (images.get(id) ?? null);

    return {
      ...this.summary(event, image(event.coverAssetId)),
      description: event.description,
      address: event.address,
      onlineUrl: event.onlineUrl,
      capacity: event.capacity,
      spotsLeft: spotsLeft(event),
      registrationOpen: registrationOpen(event, this.clock.now()),
      blocks: blocks.map((block): PublicEventBlock => {
        switch (block.type) {
          case 'text':
            return { type: 'text', body: block.data.body };
          case 'agenda_item':
            return {
              type: 'agenda_item',
              time: block.data.time,
              title: block.data.title,
              description: block.data.description ?? null,
            };
          case 'speaker':
            return {
              type: 'speaker',
              name: block.data.name,
              role: block.data.role ?? null,
              bio: block.data.bio ?? null,
              photo: image(block.data.photoAssetId),
            };
          case 'link':
            return { type: 'link', label: block.data.label, url: block.data.url };
        }
      }),
    };
  }

  /** Короткі картки подій з обкладинками (один запит за всіма файлами). */
  async summaries(events: readonly Event[]): Promise<PublicEventSummary[]> {
    const covers = await this.media.publicImages(
      events.flatMap((event) => (event.coverAssetId === null ? [] : [event.coverAssetId])),
    );
    return events.map((event) =>
      this.summary(
        event,
        event.coverAssetId === null ? null : (covers.get(event.coverAssetId) ?? null),
      ),
    );
  }

  private summary(event: Event, cover: PublicImage | null): PublicEventSummary {
    return {
      id: event.id,
      slug: event.slug,
      status: event.status === 'cancelled' ? 'cancelled' : 'published',
      title: event.title,
      summary: event.summary,
      startsAt: event.startsAt.toISOString(),
      endsAt: event.endsAt.toISOString(),
      timezone: event.timezone,
      venueName: event.venueName,
      online: event.onlineUrl !== null,
      tags: parseTags(event.tags),
      cover,
    };
  }
}
