import { Module } from '@nestjs/common';
import { IntegrationsController } from './integrations.controller.js';
import { IntegrationsInternalController } from './integrations-internal.controller.js';
import { IntegrationsService } from './integrations.service.js';
import { CredentialResolverService } from './credential-resolver.service.js';
import { IntegrationValidatorService } from './integration-validator.service.js';

@Module({
  controllers: [IntegrationsController, IntegrationsInternalController],
  providers: [IntegrationsService, CredentialResolverService, IntegrationValidatorService],
  exports: [IntegrationsService, CredentialResolverService],
})
export class IntegrationsModule {}
