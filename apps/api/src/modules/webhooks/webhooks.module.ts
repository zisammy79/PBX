import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller.js';
import { WebhooksService } from './webhooks.service.js';
import { IdempotencyService } from '../../common/services/idempotency.service.js';
import { QuotaService } from '../../common/services/quota.service.js';

@Module({
  controllers: [WebhooksController],
  providers: [WebhooksService, IdempotencyService, QuotaService],
  exports: [WebhooksService],
})
export class WebhooksModule {}
