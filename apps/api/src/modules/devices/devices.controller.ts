import { Body, Controller, Get, Inject, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { CreateSipDeviceSchema, Permission } from '@pbx/contracts';
import type { RequestWithUser } from '../../common/guards/auth.guard.js';
import { RequireAnyPermission, RequirePermissions } from '../../common/guards/auth.guard.js';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { DevicesService } from './devices.service.js';

@Controller('tenants/:tenantId/extensions/:extensionId/devices')
@UseGuards(TenantGuard)
export class DevicesController {
  constructor(@Inject(DevicesService) private readonly devicesService: DevicesService) {}

  @Get()
  @RequireAnyPermission(Permission.TENANT_EXTENSION_MANAGE, Permission.TENANT_READ)
  async list(
    @Req() req: RequestWithUser,
    @Param('tenantId') tenantId: string,
    @Param('extensionId') extensionId: string,
  ) {
    return this.devicesService.listExtensionDevices(req.user!, tenantId, extensionId);
  }

  @Post()
  @RequirePermissions(Permission.TENANT_EXTENSION_MANAGE)
  async create(
    @Req() req: RequestWithUser,
    @Param('tenantId') tenantId: string,
    @Param('extensionId') extensionId: string,
    @Body() body: unknown,
  ) {
    const parsed = CreateSipDeviceSchema.parse(body);
    return this.devicesService.createDevice(req.user!, tenantId, extensionId, parsed);
  }

  @Post(':deviceId/rotate-credential')
  @RequirePermissions(Permission.TENANT_EXTENSION_MANAGE)
  async rotate(
    @Req() req: RequestWithUser,
    @Param('tenantId') tenantId: string,
    @Param('deviceId') deviceId: string,
  ) {
    return this.devicesService.rotateDeviceCredential(req.user!, tenantId, deviceId);
  }

  @Patch(':deviceId/disable')
  @RequirePermissions(Permission.TENANT_EXTENSION_MANAGE)
  async disable(
    @Req() req: RequestWithUser,
    @Param('tenantId') tenantId: string,
    @Param('deviceId') deviceId: string,
  ) {
    return this.devicesService.updateDeviceStatus(req.user!, tenantId, deviceId, 'disabled');
  }

  @Patch(':deviceId/reactivate')
  @RequirePermissions(Permission.TENANT_EXTENSION_MANAGE)
  async reactivate(
    @Req() req: RequestWithUser,
    @Param('tenantId') tenantId: string,
    @Param('deviceId') deviceId: string,
  ) {
    return this.devicesService.updateDeviceStatus(req.user!, tenantId, deviceId, 'ready');
  }

  @Patch(':deviceId/revoke')
  @RequirePermissions(Permission.TENANT_EXTENSION_MANAGE)
  async revoke(
    @Req() req: RequestWithUser,
    @Param('tenantId') tenantId: string,
    @Param('deviceId') deviceId: string,
  ) {
    return this.devicesService.updateDeviceStatus(req.user!, tenantId, deviceId, 'revoked');
  }
}
