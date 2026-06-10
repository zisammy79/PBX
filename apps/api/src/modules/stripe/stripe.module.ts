import { Module } from '@nestjs/common';
import { IntegrationsModule } from '../integrations/integrations.module.js';
import { StripeController } from './stripe.controller.js';
import { StripeService } from './stripe.service.js';

@Module({
  imports: [IntegrationsModule],
  controllers: [StripeController],
  providers: [StripeService],
  exports: [StripeService],
})
export class StripeModule {}
