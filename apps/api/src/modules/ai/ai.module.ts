import { Module } from '@nestjs/common';
import { AiAgentsController } from './ai-agents.controller.js';
import { AiAgentsService } from './ai-agents.service.js';
import { AiProviderConnectionsController } from './ai-provider-connections.controller.js';
import { AiProviderConnectionsService } from './ai-provider-connections.service.js';
import { AiSessionsController } from './ai-sessions.controller.js';
import { AiSessionsService } from './ai-sessions.service.js';
import { AiToolsController } from './ai-tools.controller.js';
import { AiToolsService } from './ai-tools.service.js';
import { AiUsageController } from './ai-usage.controller.js';
import { AiUsageService } from './ai-usage.service.js';

@Module({
  controllers: [
    AiProviderConnectionsController,
    AiAgentsController,
    AiSessionsController,
    AiToolsController,
    AiUsageController,
  ],
  providers: [
    AiProviderConnectionsService,
    AiAgentsService,
    AiSessionsService,
    AiToolsService,
    AiUsageService,
  ],
  exports: [
    AiProviderConnectionsService,
    AiAgentsService,
    AiSessionsService,
    AiToolsService,
    AiUsageService,
  ],
})
export class AiModule {}
