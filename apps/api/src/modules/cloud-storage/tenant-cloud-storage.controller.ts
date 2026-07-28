import { Body, Controller, Get, Inject, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { CloudStorageProviderSchema } from '@pbx/contracts';
import { RequireAnyPermission } from '../../common/guards/auth.guard.js';
import { Permission } from '@pbx/contracts';
import type { RequestWithUser } from '../../common/guards/auth.guard.js';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { CloudStorageService } from './cloud-storage.service.js';

@Controller('tenants/:tenantId/cloud-storage')
@UseGuards(TenantGuard)
export class TenantCloudStorageController {
  constructor(@Inject(CloudStorageService) private readonly service: CloudStorageService) {}

  @Get('connections')
  @RequireAnyPermission(Permission.TENANT_UPDATE, Permission.TENANT_EXTENSION_MANAGE)
  listConnections(@Req() req: RequestWithUser, @Param('tenantId') tenantId: string) {
    return this.service.listTenantConnections(req.user!, tenantId);
  }

  @Get('export-settings')
  @RequireAnyPermission(Permission.TENANT_UPDATE, Permission.TENANT_EXTENSION_MANAGE)
  getExportSettings(@Req() req: RequestWithUser, @Param('tenantId') tenantId: string) {
    return this.service.getTenantExportSettings(req.user!, tenantId);
  }

  @Patch('export-settings')
  @RequireAnyPermission(Permission.TENANT_UPDATE, Permission.TENANT_EXTENSION_MANAGE)
  updateExportSettings(
    @Req() req: RequestWithUser,
    @Param('tenantId') tenantId: string,
    @Body() body: unknown,
  ) {
    return this.service.updateTenantExportSettings(req.user!, tenantId, body);
  }

  @Get('oauth/status')
  oauthStatus() {
    return this.service.getOAuthStatus();
  }

  @Get('oauth/:provider/start')
  @RequireAnyPermission(Permission.TENANT_UPDATE, Permission.TENANT_EXTENSION_MANAGE)
  startOAuth(
    @Req() req: RequestWithUser,
    @Param('tenantId') tenantId: string,
    @Param('provider') provider: string,
    @Query('displayName') displayName?: string,
  ) {
    const parsed = CloudStorageProviderSchema.parse(provider);
    return this.service.startOAuth(req.user!, {
      provider: parsed,
      scopeType: 'tenant',
      scopeId: tenantId,
      displayName: displayName?.trim() || `${parsed} tenant connection`,
    });
  }
}
