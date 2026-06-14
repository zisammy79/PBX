import { Module } from '@nestjs/common';
import { TenantsController } from './tenants.controller.js';
import { TenantsService } from './tenants.service.js';
import { TenantLimitsService } from './tenant-limits.service.js';

@Module({
  controllers: [TenantsController],
  providers: [TenantsService, TenantLimitsService],
  exports: [TenantsService, TenantLimitsService],
})
export class TenantsModule {}
