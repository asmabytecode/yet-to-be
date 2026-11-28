import { Controller, Delete, Get, HttpCode, Inject, Param, Post, Query, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  type ListResponse,
  type MyRegistrationDto,
  type PaginationQuery,
  paginationQuerySchema,
  type PublicEventDto,
  type PublicEventQuery,
  publicEventQuerySchema,
  type PublicEventSummary,
} from '@yet-to-be/shared';
import type { Response } from 'express';
import { z } from 'zod';
import { CurrentUser, Public } from '../../common/decorators';
import type { AuthUser } from '../../common/request-context';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { PublicEventsService } from './public-events.service';
import { RegistrationsService } from './registrations.service';

const idSchema = z.uuid();
const slugSchema = z
  .string()
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const REGISTER_LIMIT = { default: { limit: 20, ttl: 60_000 } };

/**
 * Публічні дані однакові для всіх відвідувачів: спільний кеш (CDN) може тримати їх 60 с,
 * а браузер щоразу перепитує (max-age=0) — після запису користувач одразу бачить нові місця.
 * Решта API лишається no-store (глобальний middleware).
 */
function cachePublic(res: Response): void {
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60');
  res.removeHeader('Pragma');
}

@Controller('events')
export class PublicEventsController {
  constructor(
    @Inject(PublicEventsService) private readonly events: PublicEventsService,
    @Inject(RegistrationsService) private readonly registrations: RegistrationsService,
  ) {}

  @Get()
  @Public()
  async list(
    @Query(new ZodValidationPipe(publicEventQuerySchema)) query: PublicEventQuery,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ListResponse<PublicEventSummary>> {
    const page = await this.events.list(query);
    cachePublic(res);
    return page;
  }

  @Get(':slug')
  @Public()
  async get(
    @Param('slug', new ZodValidationPipe(slugSchema)) slug: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PublicEventDto> {
    const event = await this.events.get(slug);
    cachePublic(res);
    return event;
  }

  @Post(':id/registrations')
  @HttpCode(201)
  @Throttle(REGISTER_LIMIT)
  register(
    @CurrentUser() user: AuthUser,
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
  ): Promise<MyRegistrationDto> {
    return this.registrations.register(user.id, id);
  }

  @Delete(':id/registrations/me')
  @HttpCode(204)
  @Throttle(REGISTER_LIMIT)
  async cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
  ): Promise<void> {
    await this.registrations.cancelOwn(user.id, id);
  }
}

@Controller('users/me/registrations')
export class MyRegistrationsController {
  constructor(@Inject(RegistrationsService) private readonly registrations: RegistrationsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(paginationQuerySchema)) query: PaginationQuery,
  ): Promise<ListResponse<MyRegistrationDto>> {
    return this.registrations.listMine(user.id, query);
  }
}
