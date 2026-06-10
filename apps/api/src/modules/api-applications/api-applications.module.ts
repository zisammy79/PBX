import { Module } from '@nestjs/common';
import { ApiApplicationsController } from './api-applications.controller.js';
import { ApiApplicationsService } from './api-applications.service.js';
import { ApiKeyAuthService } from './api-key-auth.service.js';
import { RateLimitService } from '../../common/services/rate-limit.service.js';
import { IdempotencyService } from '../../common/services/idempotency.service.js';
import { QuotaService } from '../../common/services/quota.service.js';

@Module({
  controllers: [ApiApplicationsController],
  providers: [
    ApiApplicationsService,
    ApiKeyAuthService,
    RateLimitService,
    IdempotencyService,
    QuotaService,
  ],
  exports: [ApiKeyAuthService, RateLimitService, IdempotencyService, QuotaService],
})
export class ApiApplicationsModule {}
