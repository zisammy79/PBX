import { Module } from '@nestjs/common';
import { CallsController } from './calls.controller.js';
import { CallsService } from './calls.service.js';
import { ExtensionRegistrationService } from './extension-registration.service.js';

@Module({
  controllers: [CallsController],
  providers: [CallsService, ExtensionRegistrationService],
  exports: [CallsService, ExtensionRegistrationService],
})
export class CallsModule {}
