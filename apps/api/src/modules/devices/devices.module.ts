import { Module, forwardRef } from '@nestjs/common';
import { TelephonyModule } from '../telephony/telephony.module.js';
import { TenantsModule } from '../tenants/tenants.module.js';
import { DevicesController } from './devices.controller.js';
import { DevicesService } from './devices.service.js';

@Module({
  imports: [TenantsModule, forwardRef(() => TelephonyModule)],
  controllers: [DevicesController],
  providers: [DevicesService],
  exports: [DevicesService],
})
export class DevicesModule {}
