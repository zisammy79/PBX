import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller.js';
import { BillingService } from './billing.service.js';
import { EventsModule } from '../events/events.module.js';
import { ApiApplicationsModule } from '../api-applications/api-applications.module.js';

@Module({
  imports: [EventsModule, ApiApplicationsModule],
  controllers: [BillingController],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}
