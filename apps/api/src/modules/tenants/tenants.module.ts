import { Module, forwardRef } from '@nestjs/common';
import { DevicesModule } from '../devices/devices.module.js';
import { ExtensionsModule } from '../extensions/extensions.module.js';
import { TelephonyModule } from '../telephony/telephony.module.js';
import { TwilioModule } from '../twilio/twilio.module.js';
import { TenantsController } from './tenants.controller.js';
import { TenantLifecycleService } from './tenant-lifecycle.service.js';
import { TenantLifecycleTelephonyService } from './tenant-lifecycle-telephony.service.js';
import { TenantLimitsService } from './tenant-limits.service.js';
import { TenantsService } from './tenants.service.js';
import { TenantProvisioningService } from './tenant-provisioning.service.js';

@Module({
  imports: [
    forwardRef(() => TelephonyModule),
    forwardRef(() => ExtensionsModule),
    forwardRef(() => DevicesModule),
    TwilioModule,
  ],
  controllers: [TenantsController],
  providers: [
    TenantsService,
    TenantLimitsService,
    TenantLifecycleService,
    TenantLifecycleTelephonyService,
    TenantProvisioningService,
  ],
  exports: [
    TenantsService,
    TenantLimitsService,
    TenantLifecycleService,
    TenantLifecycleTelephonyService,
    TenantProvisioningService,
  ],
})
export class TenantsModule {}
