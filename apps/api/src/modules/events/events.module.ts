import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AuditModule } from '../audit';
import { MediaModule } from '../media';
import { AdminEventsController } from './admin-events.controller';
import { EventsRepository } from './events.repository';
import { EventsService } from './events.service';
import { MyRegistrationsController, PublicEventsController } from './public-events.controller';
import { PublicEventsService } from './public-events.service';
import { RegistrationsRepository } from './registrations.repository';
import { RegistrationsService } from './registrations.service';

@Module({
  imports: [DatabaseModule, AuditModule, MediaModule],
  controllers: [AdminEventsController, PublicEventsController, MyRegistrationsController],
  providers: [
    EventsRepository,
    EventsService,
    PublicEventsService,
    RegistrationsRepository,
    RegistrationsService,
  ],
  exports: [EventsService, RegistrationsService],
})
export class EventsModule {}
