import { Controller, Get, Inject, Query, Req, UseGuards } from '@nestjs/common';
import { AiUsageListQuerySchema, Permission } from '@pbx/contracts';
import type { RequestWithUser } from '../../common/guards/auth.guard.js';
import { RequireAnyPermission } from '../../common/guards/auth.guard.js';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { AiUsageService } from './ai-usage.service.js';

@Controller('ai/usage')
@UseGuards(TenantGuard)
export class AiUsageController {
  constructor(@Inject(AiUsageService) private readonly service: AiUsageService) {}

  @Get()
  @RequireAnyPermission(
    Permission.AI_USAGE_READ,
    Permission.TENANT_USAGE_READ,
    Permission.PLATFORM_BILLING_READ,
  )
  async list(@Req() req: RequestWithUser, @Query() query: Record<string, string | undefined>) {
    return this.service.list(req.user!, req.activeTenantId!, AiUsageListQuerySchema.parse(query));
  }
}
