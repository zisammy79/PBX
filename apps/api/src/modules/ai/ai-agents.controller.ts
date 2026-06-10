import { Body, Controller, Get, Inject, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { CreateAiAgentSchema, Permission, UpdateAiAgentSchema } from '@pbx/contracts';
import type { RequestWithUser } from '../../common/guards/auth.guard.js';
import { RequireAnyPermission, RequirePermissions } from '../../common/guards/auth.guard.js';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { AiAgentsService } from './ai-agents.service.js';

@Controller('ai/agents')
@UseGuards(TenantGuard)
export class AiAgentsController {
  constructor(@Inject(AiAgentsService) private readonly service: AiAgentsService) {}

  @Post()
  @RequirePermissions(Permission.AI_AGENTS_MANAGE)
  async create(@Req() req: RequestWithUser, @Body() body: unknown) {
    return this.service.create(req.user!, req.activeTenantId!, CreateAiAgentSchema.parse(body));
  }

  @Get()
  @RequireAnyPermission(Permission.AI_AGENTS_READ, Permission.AI_AGENTS_MANAGE)
  async list(@Req() req: RequestWithUser) {
    return this.service.list(req.user!, req.activeTenantId!);
  }

  @Get(':id')
  @RequireAnyPermission(Permission.AI_AGENTS_READ, Permission.AI_AGENTS_MANAGE)
  async get(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.service.get(req.user!, req.activeTenantId!, id);
  }

  @Patch(':id')
  @RequirePermissions(Permission.AI_AGENTS_MANAGE)
  async update(@Req() req: RequestWithUser, @Param('id') id: string, @Body() body: unknown) {
    return this.service.update(req.user!, req.activeTenantId!, id, UpdateAiAgentSchema.parse(body));
  }

  @Post(':id/activate')
  @RequirePermissions(Permission.AI_AGENTS_MANAGE)
  async activate(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.service.activate(req.user!, req.activeTenantId!, id);
  }

  @Post(':id/disable')
  @RequirePermissions(Permission.AI_AGENTS_MANAGE)
  async disable(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.service.disable(req.user!, req.activeTenantId!, id);
  }

  @Get(':id/versions')
  @RequireAnyPermission(Permission.AI_AGENTS_READ, Permission.AI_AGENTS_MANAGE)
  async versions(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.service.listVersions(req.user!, req.activeTenantId!, id);
  }
}
