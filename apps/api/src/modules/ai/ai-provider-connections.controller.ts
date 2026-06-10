import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import {
  CreateAiProviderConnectionSchema,
  Permission,
  UpdateAiProviderConnectionSchema,
} from '@pbx/contracts';
import type { RequestWithUser } from '../../common/guards/auth.guard.js';
import { RequireAnyPermission, RequirePermissions } from '../../common/guards/auth.guard.js';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { AiProviderConnectionsService } from './ai-provider-connections.service.js';

@Controller('ai/provider-connections')
@UseGuards(TenantGuard)
export class AiProviderConnectionsController {
  constructor(
    @Inject(AiProviderConnectionsService) private readonly service: AiProviderConnectionsService,
  ) {}

  @Post()
  @RequirePermissions(Permission.AI_PROVIDER_CONNECTIONS_MANAGE)
  async create(@Req() req: RequestWithUser, @Body() body: unknown) {
    return this.service.create(req.user!, req.activeTenantId!, CreateAiProviderConnectionSchema.parse(body));
  }

  @Get()
  @RequireAnyPermission(Permission.AI_PROVIDER_CONNECTIONS_READ, Permission.AI_PROVIDER_CONNECTIONS_MANAGE)
  async list(@Req() req: RequestWithUser) {
    return this.service.list(req.user!, req.activeTenantId!);
  }

  @Get(':id')
  @RequireAnyPermission(Permission.AI_PROVIDER_CONNECTIONS_READ, Permission.AI_PROVIDER_CONNECTIONS_MANAGE)
  async get(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.service.get(req.user!, req.activeTenantId!, id);
  }

  @Patch(':id')
  @RequirePermissions(Permission.AI_PROVIDER_CONNECTIONS_MANAGE)
  async update(@Req() req: RequestWithUser, @Param('id') id: string, @Body() body: unknown) {
    return this.service.update(req.user!, req.activeTenantId!, id, UpdateAiProviderConnectionSchema.parse(body));
  }

  @Delete(':id')
  @RequirePermissions(Permission.AI_PROVIDER_CONNECTIONS_MANAGE)
  async remove(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.service.remove(req.user!, req.activeTenantId!, id);
  }

  @Post(':id/test')
  @RequirePermissions(Permission.AI_PROVIDER_CONNECTIONS_MANAGE)
  async test(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.service.test(req.user!, req.activeTenantId!, id);
  }
}
