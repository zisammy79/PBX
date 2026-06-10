import { Controller, Get, Inject, Param, Req, UseGuards } from '@nestjs/common';
import { Permission } from '@pbx/contracts';
import type { RequestWithUser } from '../../common/guards/auth.guard.js';
import { RequirePermissions } from '../../common/guards/auth.guard.js';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { DashboardService } from './dashboard.service.js';

@Controller()
export class DashboardController {
  constructor(@Inject(DashboardService) private readonly service: DashboardService) {}

  @Get('tenants/:tenantId/dashboard')
  @UseGuards(TenantGuard)
  @RequirePermissions(Permission.TENANT_READ)
  async tenantDashboard(@Req() req: RequestWithUser, @Param('tenantId') tenantId: string) {
    return this.service.tenantSummary(req.user!, tenantId);
  }

  @Get('platform/dashboard')
  @RequirePermissions(Permission.PLATFORM_TENANT_READ)
  async platformDashboard(@Req() req: RequestWithUser) {
    return this.service.platformSummary(req.user!);
  }
}
