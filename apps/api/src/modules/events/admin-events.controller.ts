import {
  Body,
  Delete,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import {
  type AdminEventDetailDto,
  type AdminEventDto,
  type AdminRegistrationDto,
  type CreateEventInput,
  createEventSchema,
  type EventQuery,
  eventQuerySchema,
  type EventTransitionInput,
  eventTransitionSchema,
  type ListResponse,
  type RegistrationQuery,
  registrationQuerySchema,
  type ReplaceBlocksInput,
  replaceBlocksSchema,
  type UpdateEventInput,
  updateEventSchema,
} from '@yet-to-be/shared';
import type { Request } from 'express';
import { z } from 'zod';
import type { AccessSnapshot } from '../../common/request-context';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { AdminController } from '../../platform/admin-controller';
import { CurrentAccess, RequirePermission, RequireStepUp } from '../../platform/require-permission';
import { type EventActor, EventsService } from './events.service';
import { RegistrationsService } from './registrations.service';

const idSchema = z.uuid();
/** Ключ ідемпотентності: необов'язковий, але якщо є — лише безпечні символи. */
const idempotencyKeySchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{8,64}$/)
  .optional();

const actorOf = (access: AccessSnapshot, req: Request): EventActor => ({
  userId: access.userId,
  ip: req.ip ?? null,
});

@AdminController('events')
export class AdminEventsController {
  constructor(
    @Inject(EventsService) private readonly events: EventsService,
    @Inject(RegistrationsService) private readonly registrations: RegistrationsService,
  ) {}

  @Get()
  @RequirePermission('events:read')
  list(
    @Query(new ZodValidationPipe(eventQuerySchema)) query: EventQuery,
  ): Promise<ListResponse<AdminEventDto>> {
    return this.events.list(query);
  }

  @Get(':id')
  @RequirePermission('events:read')
  get(@Param('id', new ZodValidationPipe(idSchema)) id: string): Promise<AdminEventDetailDto> {
    return this.events.get(id);
  }

  @Post()
  @RequirePermission('events:write')
  create(
    @CurrentAccess() access: AccessSnapshot,
    @Body(new ZodValidationPipe(createEventSchema)) input: CreateEventInput,
    @Headers('idempotency-key') rawKey: string | undefined,
    @Req() req: Request,
  ): Promise<AdminEventDetailDto> {
    // @Headers не приймає pipe, тому перевіряємо тим самим ZodValidationPipe вручну.
    const key = new ZodValidationPipe(idempotencyKeySchema).transform(rawKey);
    return this.events.create(actorOf(access, req), input, key ?? null);
  }

  @Patch(':id')
  @RequirePermission('events:write')
  update(
    @CurrentAccess() access: AccessSnapshot,
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Body(new ZodValidationPipe(updateEventSchema)) input: UpdateEventInput,
    @Req() req: Request,
  ): Promise<AdminEventDto> {
    return this.events.update(actorOf(access, req), id, input);
  }

  /** Повна заміна списку блоків: додавання, видалення й зміна порядку — одним запитом. */
  @Put(':id/blocks')
  @RequirePermission('events:write')
  replaceBlocks(
    @CurrentAccess() access: AccessSnapshot,
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Body(new ZodValidationPipe(replaceBlocksSchema)) input: ReplaceBlocksInput,
    @Req() req: Request,
  ): Promise<AdminEventDetailDto> {
    return this.events.replaceBlocks(actorOf(access, req), id, input);
  }

  @Post(':id/transition')
  @HttpCode(200)
  @RequirePermission('events:publish')
  transition(
    @CurrentAccess() access: AccessSnapshot,
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Body(new ZodValidationPipe(eventTransitionSchema)) input: EventTransitionInput,
    @Req() req: Request,
  ): Promise<AdminEventDto> {
    return this.events.transition(actorOf(access, req), id, input);
  }

  @Post(':id/duplicate')
  @RequirePermission('events:write')
  duplicate(
    @CurrentAccess() access: AccessSnapshot,
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Req() req: Request,
  ): Promise<AdminEventDetailDto> {
    return this.events.duplicate(actorOf(access, req), id);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('events:delete')
  @RequireStepUp()
  async remove(
    @CurrentAccess() access: AccessSnapshot,
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Req() req: Request,
  ): Promise<void> {
    await this.events.delete(actorOf(access, req), id);
  }

  @Get(':id/registrations')
  @RequirePermission('registrations:read')
  listRegistrations(
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Query(new ZodValidationPipe(registrationQuerySchema)) query: RegistrationQuery,
  ): Promise<ListResponse<AdminRegistrationDto>> {
    return this.registrations.listForEvent(id, query);
  }

  @Post(':id/registrations/:registrationId/cancel')
  @HttpCode(204)
  @RequirePermission('registrations:manage')
  async cancelRegistration(
    @CurrentAccess() access: AccessSnapshot,
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Param('registrationId', new ZodValidationPipe(idSchema)) registrationId: string,
    @Req() req: Request,
  ): Promise<void> {
    await this.registrations.cancelByAdmin(actorOf(access, req), id, registrationId);
  }
}
