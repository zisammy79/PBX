import { Body, Controller, Get, Inject, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Permission, RequestTenantSipDomainSchema } from '@pbx/contracts';
import type { RequestWithUser } from '../../common/guards/auth.guard.js';
import { RequireAnyPermission, RequirePermissions } from '../../common/guards/auth.guard.js';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { SipDomainsService } from './sip-domains.service.js';

@Controller('tenants/:tenantId/sip-domain')
@UseGuards(TenantGuard)
export class SipDomainsController {
  constructor(@Inject(SipDomainsService) private readonly sipDomainsService: SipDomainsService) {}

  @Get()
  @RequireAnyPermission(Permission.TENANT_READ, Permission.TENANT_UPDATE)
  async get(@Req() req: RequestWithUser, @Param('tenantId') tenantId: string) {
    return this.sipDomainsService.getDomainSummary(req.user!, tenantId);
  }

  @Post('request')
  @RequirePermissions(Permission.TENANT_UPDATE)
  async request(@Req() req: RequestWithUser, @Param('tenantId') tenantId: string, @Body() body: unknown) {
    const parsed = RequestTenantSipDomainSchema.parse(body);
    return this.sipDomainsService.requestDomain(req.user!, tenantId, parsed);
  }

  @Post('validate')
  @RequirePermissions(Permission.TENANT_UPDATE)
  async validate(@Req() req: RequestWithUser, @Param('tenantId') tenantId: string) {
    return this.sipDomainsService.validateDomain(req.user!, tenantId);
  }

  @Post('activate')
  @RequirePermissions(Permission.TENANT_UPDATE)
  async activate(@Req() req: RequestWithUser, @Param('tenantId') tenantId: string) {
    return this.sipDomainsService.activateDomain(req.user!, tenantId);
  }

  @Post('disable')
  @RequirePermissions(Permission.TENANT_UPDATE)
  async disable(@Req() req: RequestWithUser, @Param('tenantId') tenantId: string) {
    return this.sipDomainsService.disableDomain(req.user!, tenantId);
  }
}
