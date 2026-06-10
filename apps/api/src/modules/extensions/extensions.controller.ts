import { Body, Controller, Get, Inject, Param, Post, Req, UseGuards } from '@nestjs/common';
import { CreateExtensionRequestSchema, Permission } from '@pbx/contracts';
import type { RequestWithUser } from '../../common/guards/auth.guard.js';
import {
  RequireAnyPermission,
  RequirePermissions,
} from '../../common/guards/auth.guard.js';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { ExtensionsService } from './extensions.service.js';

@Controller('tenants/:tenantId/extensions')
@UseGuards(TenantGuard)
export class ExtensionsController {
  constructor(@Inject(ExtensionsService) private readonly extensionsService: ExtensionsService) {}

  @Post()
  @RequirePermissions(Permission.TENANT_EXTENSION_MANAGE)
  async create(
    @Req() req: RequestWithUser,
    @Param('tenantId') tenantId: string,
    @Body() body: unknown,
  ) {
    const parsed = CreateExtensionRequestSchema.parse(body);
    return this.extensionsService.createExtension(req.user!, tenantId, parsed);
  }

  @Get()
  @RequireAnyPermission(Permission.TENANT_EXTENSION_MANAGE, Permission.TENANT_CALL_READ)
  async list(@Req() req: RequestWithUser, @Param('tenantId') tenantId: string) {
    return this.extensionsService.listExtensions(req.user!, tenantId);
  }

  @Get(':extensionId')
  @RequirePermissions(Permission.TENANT_EXTENSION_MANAGE)
  async get(
    @Req() req: RequestWithUser,
    @Param('tenantId') tenantId: string,
    @Param('extensionId') extensionId: string,
  ) {
    return this.extensionsService.getExtension(req.user!, tenantId, extensionId);
  }
}
