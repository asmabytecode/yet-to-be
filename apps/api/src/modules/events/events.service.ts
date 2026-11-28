import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import {
  type AdminEventDetailDto,
  type AdminEventDto,
  type CreateEventInput,
  ERROR_CODES,
  type EventBlock as EventBlockInput,
  eventBlockSchema,
  type EventQuery,
  eventStatusSchema,
  type EventTransitionInput,
  type ListResponse,
  nextStatus,
  type ReplaceBlocksInput,
  type UpdateEventInput,
} from '@yet-to-be/shared';
import { AppException } from '../../common/app-exception';
import { UniqueConstraintError } from '../../database/errors';
import type { Event, EventBlock } from '../../generated/prisma/client';
import { CLOCK, type Clock } from '../../platform/clock';
import { DomainEventBus } from '../../platform/domain-events';
import { MediaUsageRegistry } from '../../platform/media-usage';
import { pageArgs, toPage } from '../../platform/pagination';
import { ADMIN_AUDIT, AuditService } from '../audit';
import { MediaService } from '../media';
import { type EventWrite, EventsRepository } from './events.repository';
import { slugCandidate, slugify } from './slug';

export interface EventActor {
  userId: string;
  ip: string | null;
}

const SLUG_ATTEMPTS = 50;
const IDEMPOTENCY_SCOPE = 'event.create';

const notFound = () => new AppException(404, ERROR_CODES.NOT_FOUND, 'Event not found');
const conflict = () =>
  new AppException(
    409,
    ERROR_CODES.EVENT_VERSION_CONFLICT,
    'The event was changed by someone else',
  );

export function parseTags(raw: string): string[] {
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value)
      ? value.filter((tag): tag is string => typeof tag === 'string')
      : [];
  } catch {
    return [];
  }
}

export function toEventDto(event: Event): AdminEventDto {
  return {
    id: event.id,
    slug: event.slug,
    status: eventStatusSchema.catch('draft').parse(event.status),
    title: event.title,
    summary: event.summary,
    description: event.description,
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt.toISOString(),
    timezone: event.timezone,
    venueName: event.venueName,
    address: event.address,
    onlineUrl: event.onlineUrl,
    capacity: event.capacity,
    coverAssetId: event.coverAssetId,
    tags: parseTags(event.tags),
    publishedAt: event.publishedAt?.toISOString() ?? null,
    version: event.version,
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(),
  };
}

/** Медіа, на які посилаються поля й блоки події: усі мають бути готові (ready). */
function referencedMedia(
  coverAssetId: string | null | undefined,
  blocks: readonly EventBlockInput[],
) {
  const ids = new Set<string>();
  if (typeof coverAssetId === 'string') ids.add(coverAssetId);
  for (const block of blocks) {
    if (block.type === 'speaker' && block.data.photoAssetId !== undefined) {
      ids.add(block.data.photoAssetId);
    }
  }
  return [...ids];
}

/** Що бракує для публікації (порожньо — можна публікувати). */
export function missingForPublish(event: Event, now: Date): string[] {
  const missing: string[] = [];
  if ((event.summary ?? '').trim() === '') missing.push('summary');
  if ((event.venueName ?? '').trim() === '' && (event.onlineUrl ?? '') === '') {
    missing.push('venueName');
  }
  if (event.endsAt <= now) missing.push('endsAt');
  return missing;
}

@Injectable()
export class EventsService implements OnModuleInit {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    @Inject(EventsRepository) private readonly repository: EventsRepository,
    @Inject(MediaService) private readonly media: MediaService,
    @Inject(MediaUsageRegistry) private readonly mediaUsage: MediaUsageRegistry,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(DomainEventBus) private readonly events: DomainEventBus,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  onModuleInit(): void {
    // Файл, на який посилається подія, не видалиться (модуль медіа не знає про події).
    this.mediaUsage.register((assetId) => this.repository.usesAsset(assetId));
  }

  async list(query: EventQuery): Promise<ListResponse<AdminEventDto>> {
    const rows = await this.repository.list(query, pageArgs(query));
    return toPage(rows, query.limit, toEventDto);
  }

  async get(id: string): Promise<AdminEventDetailDto> {
    const event = await this.repository.findDetail(id);
    if (event === null) throw notFound();
    return { ...toEventDto(event), blocks: this.parseBlocks(event.blocks) };
  }

  async create(
    actor: EventActor,
    input: CreateEventInput,
    idempotencyKey: string | null,
  ): Promise<AdminEventDetailDto> {
    if (idempotencyKey !== null) {
      const existing = await this.repository.findIdempotent(
        actor.userId,
        IDEMPOTENCY_SCOPE,
        idempotencyKey,
      );
      if (existing !== null) return this.get(existing);
    }
    await this.assertMediaReady(referencedMedia(input.coverAssetId, []));

    const event = await this.createWithUniqueSlug(slugify(input.title), (slug) => ({
      slug,
      title: input.title,
      summary: input.summary,
      description: input.description,
      startsAt: new Date(input.startsAt),
      endsAt: new Date(input.endsAt),
      timezone: input.timezone,
      venueName: input.venueName,
      address: input.address,
      onlineUrl: input.onlineUrl,
      capacity: input.capacity,
      coverAssetId: input.coverAssetId,
      tags: JSON.stringify(input.tags),
      createdById: actor.userId,
      updatedById: actor.userId,
    }));
    if (idempotencyKey !== null) {
      await this.repository.saveIdempotent(
        actor.userId,
        IDEMPOTENCY_SCOPE,
        idempotencyKey,
        event.id,
      );
    }
    await this.record(actor, ADMIN_AUDIT.EVENT_CREATE, event.id, { slug: event.slug });
    return this.get(event.id);
  }

  async update(actor: EventActor, id: string, input: UpdateEventInput): Promise<AdminEventDto> {
    const current = await this.repository.find(id);
    if (current === null) throw notFound();

    const startsAt = input.startsAt === undefined ? current.startsAt : new Date(input.startsAt);
    const endsAt = input.endsAt === undefined ? current.endsAt : new Date(input.endsAt);
    if (endsAt <= startsAt) {
      throw new AppException(400, ERROR_CODES.VALIDATION_FAILED, 'Validation failed', [
        { path: 'endsAt', code: 'custom' },
      ]);
    }
    // Місткість не можна зменшити нижче вже записаних (інакше «мінус місця»).
    if (typeof input.capacity === 'number' && input.capacity < current.registeredCount) {
      throw new AppException(400, ERROR_CODES.VALIDATION_FAILED, 'Validation failed', [
        { path: 'capacity', code: 'too_small' },
      ]);
    }
    if (input.coverAssetId !== undefined)
      await this.assertMediaReady(referencedMedia(input.coverAssetId, []));

    const { version, tags, ...fields } = input;
    const data: EventWrite = { updatedById: actor.userId };
    for (const [key, value] of Object.entries(fields)) {
      if (value === undefined) continue;
      (data as Record<string, unknown>)[key] =
        key === 'startsAt' || key === 'endsAt' ? new Date(value as string) : value;
    }
    if (tags !== undefined) data.tags = JSON.stringify(tags);

    const updated = await this.repository.updateVersioned(id, version, data);
    if (updated === null) throw conflict();
    // Опублікована подія має лишатися повною після редагування.
    if (updated.status === 'published' && missingForPublish(updated, this.clock.now()).length > 0) {
      this.logger.warn(`Published event ${id} became incomplete after an edit`);
    }
    await this.record(actor, ADMIN_AUDIT.EVENT_UPDATE, id, {
      changed: Object.keys(input)
        .filter((key) => key !== 'version')
        .sort(),
    });
    return toEventDto(updated);
  }

  async replaceBlocks(
    actor: EventActor,
    id: string,
    input: ReplaceBlocksInput,
  ): Promise<AdminEventDetailDto> {
    if ((await this.repository.find(id)) === null) throw notFound();
    await this.assertMediaReady(referencedMedia(undefined, input.blocks));
    const updated = await this.repository.replaceBlocks(
      id,
      input.version,
      input.blocks,
      actor.userId,
    );
    if (updated === null) throw conflict();
    await this.record(actor, ADMIN_AUDIT.EVENT_BLOCKS, id, {
      count: input.blocks.length,
      types: [...new Set(input.blocks.map((block) => block.type))].sort(),
    });
    return this.get(id);
  }

  async transition(
    actor: EventActor,
    id: string,
    input: EventTransitionInput,
  ): Promise<AdminEventDto> {
    const current = await this.repository.find(id);
    if (current === null) throw notFound();
    const from = eventStatusSchema.catch('draft').parse(current.status);
    const to = nextStatus(from, input.action);
    if (to === null) {
      throw new AppException(
        409,
        ERROR_CODES.EVENT_INVALID_TRANSITION,
        `Cannot ${input.action} a ${from} event`,
      );
    }
    const now = this.clock.now();
    if (input.action === 'publish') {
      const missing = missingForPublish(current, now);
      if (missing.length > 0) {
        throw new AppException(
          409,
          ERROR_CODES.EVENT_INCOMPLETE,
          'The event is not ready to be published',
          missing.map((path) => ({ path, code: 'required' })),
        );
      }
    }
    const updated = await this.repository.updateVersioned(id, input.version, {
      updatedById: actor.userId,
      status: to,
      ...(input.action === 'publish' ? { publishedAt: now } : {}),
      ...(input.action === 'unpublish' ? { publishedAt: null } : {}),
    });
    if (updated === null) throw conflict();
    await this.record(actor, ADMIN_AUDIT.EVENT_TRANSITION, id, { action: input.action, from, to });
    if (to === 'published')
      await this.events.publish('event.published', { eventId: id, actorId: actor.userId });
    return toEventDto(updated);
  }

  async duplicate(actor: EventActor, id: string): Promise<AdminEventDetailDto> {
    const source = await this.repository.findDetail(id);
    if (source === null) throw notFound();
    const title = `${source.title} (копія)`.slice(0, 140);
    const blocks = this.parseBlocks(source.blocks).map((block) =>
      eventBlockSchema.parse({ type: block.type, data: block.data }),
    );
    const copy = await this.createWithUniqueSlug(
      slugify(title),
      (slug) => ({
        slug,
        title,
        summary: source.summary,
        description: source.description,
        startsAt: source.startsAt,
        endsAt: source.endsAt,
        timezone: source.timezone,
        venueName: source.venueName,
        address: source.address,
        onlineUrl: source.onlineUrl,
        capacity: source.capacity,
        coverAssetId: source.coverAssetId,
        tags: source.tags,
        createdById: actor.userId,
        updatedById: actor.userId,
      }),
      blocks,
    );
    await this.record(actor, ADMIN_AUDIT.EVENT_DUPLICATE, copy.id, { sourceId: id });
    return this.get(copy.id);
  }

  /** М'яке видалення. Опубліковану подію спершу треба зняти з публікації або скасувати. */
  async delete(actor: EventActor, id: string): Promise<void> {
    const current = await this.repository.find(id);
    if (current === null) throw notFound();
    if (current.status === 'published') {
      throw new AppException(
        409,
        ERROR_CODES.EVENT_INVALID_TRANSITION,
        'Unpublish or cancel the event first',
      );
    }
    if (!(await this.repository.softDelete(id, this.clock.now(), actor.userId))) return;
    await this.record(actor, ADMIN_AUDIT.EVENT_DELETE, id, { status: current.status });
  }

  private async createWithUniqueSlug(
    base: string,
    build: (slug: string) => Parameters<EventsRepository['create']>[0],
    blocks: readonly EventBlockInput[] = [],
  ): Promise<Event> {
    for (let attempt = 1; attempt <= SLUG_ATTEMPTS; attempt += 1) {
      const slug = slugCandidate(base, attempt);
      if (await this.repository.slugExists(slug)) continue;
      try {
        return await this.repository.create(build(slug), blocks);
      } catch (error) {
        // Паралельне створення з тим самим slug — пробуємо наступний.
        if (!(error instanceof UniqueConstraintError)) throw error;
      }
    }
    throw new AppException(409, ERROR_CODES.CONFLICT, 'Could not generate a unique slug');
  }

  private async assertMediaReady(ids: readonly string[]): Promise<void> {
    for (const id of ids) await this.media.assertReady(id);
  }

  /** Блоки з БД валідуються ще раз: зламані дані не доходять до клієнта. */
  parseBlocks(rows: readonly EventBlock[]): AdminEventDetailDto['blocks'] {
    const blocks: AdminEventDetailDto['blocks'] = [];
    for (const row of rows) {
      let data: unknown;
      try {
        data = JSON.parse(row.data);
      } catch {
        data = null;
      }
      const parsed = eventBlockSchema.safeParse({ type: row.type, data });
      if (parsed.success) blocks.push({ ...parsed.data, id: row.id });
      else this.logger.warn(`Skipping invalid block ${row.id}`);
    }
    return blocks;
  }

  private record(
    actor: EventActor,
    action: string,
    eventId: string,
    metadata: Record<string, unknown>,
  ) {
    return this.audit.record({
      actorId: actor.userId,
      action,
      target: { type: 'event', id: eventId },
      metadata,
      ip: actor.ip,
    });
  }
}
