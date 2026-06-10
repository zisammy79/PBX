import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { CreateAiToolSchema, Permission, UpdateAiToolSchema } from '@pbx/contracts';
import type { RequestWithUser } from '../../common/guards/auth.guard.js';
import { RequireAnyPermission, RequirePermissions } from '../../common/guards/auth.guard.js';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { AiToolsService } from './ai-tools.service.js';

@Controller('ai/tools')
@UseGuards(TenantGuard)
export class AiToolsController {
  constructor(@Inject(AiToolsService) private readonly service: AiToolsService) {}

  @Post()
  @RequirePermissions(Permission.AI_AGENTS_MANAGE)
  async create(@Req() req: RequestWithUser, @Body() body: unknown) {
    return this.service.create(req.user!, req.activeTenantId!, CreateAiToolSchema.parse(body));
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
    return this.service.update(req.user!, req.activeTenantId!, id, UpdateAiToolSchema.parse(body));
  }

  @Delete(':id')
  @RequirePermissions(Permission.AI_AGENTS_MANAGE)
  async remove(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.service.remove(req.user!, req.activeTenantId!, id);
  }
}
