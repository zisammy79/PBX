import { Module } from '@nestjs/common';
import { EventPublicationService } from './event-publication.service.js';

@Module({
  providers: [EventPublicationService],
  exports: [EventPublicationService],
})
export class EventsModule {}
