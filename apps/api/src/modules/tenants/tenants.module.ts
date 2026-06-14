import { Module } from '@nestjs/common';
import { TenantsController } from './tenants.controller.js';
import { TenantLifecycleService } from './tenant-lifecycle.service.js';
import { TenantLimitsService } from './tenant-limits.service.js';
import { TenantsService } from './tenants.service.js';

@Module({
  controllers: [TenantsController],
  providers: [TenantsService, TenantLimitsService, TenantLifecycleService],
  exports: [TenantsService, TenantLimitsService, TenantLifecycleService],
})
export class TenantsModule {}
