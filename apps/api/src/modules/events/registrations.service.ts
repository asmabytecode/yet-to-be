import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import {
  type AdminRegistrationDto,
  ERROR_CODES,
  type ListResponse,
  type MyRegistrationDto,
  type PaginationQuery,
  REGISTRATION_CANCEL_REASONS,
  type RegistrationQuery,
  registrationStatusSchema,
} from '@yet-to-be/shared';
import { AppException } from '../../common/app-exception';
import { UsersRepository } from '../../database/repositories/users.repository';
import type { EventRegistration } from '../../generated/prisma/client';
import { CLOCK, type Clock } from '../../platform/clock';
import { DomainEventBus } from '../../platform/domain-events';
import { pageArgs, toPage } from '../../platform/pagination';
import { ADMIN_AUDIT, AuditService } from '../audit';
import { EventsRepository } from './events.repository';
import type { EventActor } from './events.service';
import { PublicEventsService } from './public-events.service';
import { RegistrationsRepository } from './registrations.repository';

const notFound = () => new AppException(404, ERROR_CODES.NOT_FOUND, 'Event not found');
const closed = () =>
  new AppException(409, ERROR_CODES.REGISTRATION_CLOSED, 'Registration is closed');

function toAdminDto(row: EventRegistration, names: Map<string, string>): AdminRegistrationDto {
  return {
    id: row.id,
    userId: row.userId,
    displayName: names.get(row.userId) ?? '—',
    status: registrationStatusSchema.catch('cancelled').parse(row.status),
    createdAt: row.createdAt.toISOString(),
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    cancelReason: REGISTRATION_CANCEL_REASONS.find((value) => value === row.cancelReason) ?? null,
  };
}

@Injectable()
export class RegistrationsService implements OnModuleInit {
  private readonly logger = new Logger(RegistrationsService.name);

  constructor(
    @Inject(RegistrationsRepository) private readonly repository: RegistrationsRepository,
    @Inject(EventsRepository) private readonly events: EventsRepository,
    @Inject(PublicEventsService) private readonly publicEvents: PublicEventsService,
    @Inject(UsersRepository) private readonly users: UsersRepository,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(DomainEventBus) private readonly bus: DomainEventBus,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  onModuleInit(): void {
    // Заблокований акаунт не займає місць на майбутніх подіях.
    this.bus.subscribe('user.blocked', async ({ userId }) => {
      const cancelled = await this.cancelUpcomingForUser(userId);
      if (cancelled > 0)
        this.logger.log(`Cancelled ${String(cancelled)} registrations of a blocked user`);
    });
  }

  async register(userId: string, eventId: string): Promise<MyRegistrationDto> {
    const event = await this.events.findPublicById(eventId);
    if (event === null) throw notFound();
    if (event.status !== 'published' || event.startsAt <= this.clock.now()) throw closed();

    const outcome = await this.repository.register(eventId, userId);
    if (outcome === 'full') {
      throw new AppException(409, ERROR_CODES.EVENT_FULL, 'No spots left');
    }
    const registration = await this.repository.find(eventId, userId);
    const fresh = await this.events.find(eventId);
    if (registration === null || fresh === null) throw notFound();
    const [summary] = await this.publicEvents.summaries([fresh]);
    if (summary === undefined) throw notFound();
    return {
      id: registration.id,
      status: 'registered',
      createdAt: registration.createdAt.toISOString(),
      event: summary,
    };
  }

  /** Скасування власного запису. Повторне скасування — не помилка (ідемпотентно). */
  async cancelOwn(userId: string, eventId: string): Promise<void> {
    const event = await this.events.findPublicById(eventId);
    if (event === null) throw notFound();
    const registration = await this.repository.find(eventId, userId);
    if (registration?.status !== 'registered') return;
    if (event.startsAt <= this.clock.now()) throw closed();
    await this.repository.cancel(registration.id, 'self', this.clock.now());
  }

  async listMine(userId: string, query: PaginationQuery): Promise<ListResponse<MyRegistrationDto>> {
    const rows = await this.repository.listForUser(userId, pageArgs(query));
    const page = toPage(rows, query.limit, (row) => row);
    const summaries = await this.publicEvents.summaries(page.items.map((row) => row.event));
    return {
      items: page.items.flatMap((row, index) => {
        const event = summaries[index];
        return event === undefined
          ? []
          : [
              {
                id: row.id,
                status: 'registered' as const,
                createdAt: row.createdAt.toISOString(),
                event,
              },
            ];
      }),
      nextCursor: page.nextCursor,
    };
  }

  async listForEvent(
    eventId: string,
    query: RegistrationQuery,
  ): Promise<ListResponse<AdminRegistrationDto>> {
    if ((await this.events.find(eventId)) === null) throw notFound();
    const rows = await this.repository.listForEvent(
      eventId,
      query.status === undefined ? {} : { status: query.status },
      pageArgs(query),
    );
    const names = await this.users.findDisplayNames(rows.map((row) => row.userId));
    return toPage(rows, query.limit, (row) => toAdminDto(row, names));
  }

  async cancelByAdmin(actor: EventActor, eventId: string, registrationId: string): Promise<void> {
    const registration = await this.repository.findById(registrationId);
    if (registration?.eventId !== eventId) {
      throw new AppException(404, ERROR_CODES.NOT_FOUND, 'Registration not found');
    }
    if (!(await this.repository.cancel(registrationId, 'admin', this.clock.now()))) return;
    await this.audit.record({
      actorId: actor.userId,
      action: ADMIN_AUDIT.REGISTRATION_CANCEL,
      target: { type: 'registration', id: registrationId },
      metadata: { eventId },
      ip: actor.ip,
    });
  }

  private async cancelUpcomingForUser(userId: string): Promise<number> {
    const now = this.clock.now();
    let cancelled = 0;
    for (const registration of await this.repository.findUpcomingForUser(userId, now)) {
      if (await this.repository.cancel(registration.id, 'user_blocked', now)) cancelled += 1;
    }
    return cancelled;
  }
}
