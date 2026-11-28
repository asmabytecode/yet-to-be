import { Global, Module } from '@nestjs/common';
import { CLOCK, systemClock } from './clock';
import { DomainEventBus } from './domain-events';
import { JobQueue } from './job-queue';
import { MediaUsageRegistry } from './media-usage';

/** Інфраструктура, спільна для всіх модулів: шина подій, черга задач, годинник. */
@Global()
@Module({
  providers: [
    DomainEventBus,
    JobQueue,
    MediaUsageRegistry,
    { provide: CLOCK, useValue: systemClock },
  ],
  exports: [DomainEventBus, JobQueue, MediaUsageRegistry, CLOCK],
})
export class PlatformModule {}
