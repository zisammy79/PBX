import { Module } from '@nestjs/common';
import { RateLimitService } from '../../common/services/rate-limit.service.js';
import { PlatformApiTokenAuthService } from './platform-api-token-auth.service.js';
import { PlatformApiTokensController } from './platform-api-tokens.controller.js';
import { PlatformApiTokensService } from './platform-api-tokens.service.js';

@Module({
  controllers: [PlatformApiTokensController],
  providers: [PlatformApiTokensService, PlatformApiTokenAuthService, RateLimitService],
  exports: [PlatformApiTokenAuthService],
})
export class PlatformApiTokensModule {}
