import { Module } from '@nestjs/common';
import { TelephonyController } from './telephony.controller.js';
import { TelephonyService } from './telephony.service.js';

@Module({
  controllers: [TelephonyController],
  providers: [TelephonyService],
  exports: [TelephonyService],
})
export class TelephonyModule {}
