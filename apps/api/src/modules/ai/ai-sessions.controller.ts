import { Controller, Get, Inject, Param, Query, Req, UseGuards } from '@nestjs/common';
import { AiSessionListQuerySchema, Permission } from '@pbx/contracts';
import type { RequestWithUser } from '../../common/guards/auth.guard.js';
import { RequireAnyPermission, RequirePermissions } from '../../common/guards/auth.guard.js';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { AiSessionsService } from './ai-sessions.service.js';

@Controller('ai/sessions')
@UseGuards(TenantGuard)
export class AiSessionsController {
  constructor(@Inject(AiSessionsService) private readonly service: AiSessionsService) {}

  @Get()
  @RequireAnyPermission(Permission.AI_SESSIONS_READ, Permission.AI_AGENTS_MANAGE)
  async list(@Req() req: RequestWithUser, @Query() query: Record<string, string | undefined>) {
    return this.service.list(req.user!, req.activeTenantId!, AiSessionListQuerySchema.parse(query));
  }

  @Get(':id')
  @RequireAnyPermission(Permission.AI_SESSIONS_READ, Permission.AI_AGENTS_MANAGE)
  async get(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.service.get(req.user!, req.activeTenantId!, id);
  }

  @Get(':id/diagnostics')
  @RequirePermissions(Permission.AI_SESSIONS_DIAGNOSTICS)
  async diagnostics(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.service.diagnostics(req.user!, req.activeTenantId!, id);
  }

  @Get(':id/tools')
  @RequireAnyPermission(Permission.AI_SESSIONS_READ, Permission.AI_SESSIONS_DIAGNOSTICS)
  async tools(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.service.tools(req.user!, req.activeTenantId!, id);
  }
}
