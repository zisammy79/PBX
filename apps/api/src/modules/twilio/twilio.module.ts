import { Module, forwardRef } from '@nestjs/common';
import { TelephonyModule } from '../telephony/telephony.module.js';
import { TwilioOrdersController, TwilioController } from './twilio.controller.js';
import { TwilioProvisioningService } from './twilio-provisioning.service.js';
import { TwilioService } from './twilio.service.js';

@Module({
  imports: [forwardRef(() => TelephonyModule)],
  controllers: [TwilioController, TwilioOrdersController],
  providers: [TwilioService, TwilioProvisioningService],
  exports: [TwilioService, TwilioProvisioningService],
})
export class TwilioModule {}
