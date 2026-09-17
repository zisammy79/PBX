import { Module } from '@nestjs/common';
import { TenantsModule } from '../tenants/tenants.module.js';
import { CallflowController } from './callflow.controller.js';
import { CallflowPlatformController } from './callflow-platform.controller.js';
import { CallflowService } from './callflow.service.js';

@Module({
  imports: [TenantsModule],
  controllers: [CallflowController, CallflowPlatformController],
  providers: [CallflowService],
  exports: [CallflowService],
})
export class CallflowModule {}
