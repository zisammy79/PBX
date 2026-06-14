import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { CreateExtensionRequestSchema, Permission, UpdateExtensionRecordingPolicySchema } from '@pbx/contracts';
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

  @Post(':extensionId/reconcile')
  @RequirePermissions(Permission.TENANT_EXTENSION_MANAGE)
  async reconcile(
    @Req() req: RequestWithUser,
    @Param('tenantId') tenantId: string,
    @Param('extensionId') extensionId: string,
    @Body() body: unknown,
  ) {
    const rotateCredential =
      typeof body === 'object' &&
      body !== null &&
      'rotateCredential' in body &&
      (body as { rotateCredential?: boolean }).rotateCredential === true;
    return this.extensionsService.reconcileExtension(req.user!, tenantId, extensionId, {
      rotateCredential,
    });
  }

  @Post(':extensionId/rotate-credential')
  @RequirePermissions(Permission.TENANT_EXTENSION_MANAGE)
  async rotateCredential(
    @Req() req: RequestWithUser,
    @Param('tenantId') tenantId: string,
    @Param('extensionId') extensionId: string,
  ) {
    return this.extensionsService.rotateSipCredential(req.user!, tenantId, extensionId);
  }

  @Patch(':extensionId/recording-policy')
  @RequirePermissions(Permission.TENANT_EXTENSION_MANAGE)
  async updateRecordingPolicy(
    @Req() req: RequestWithUser,
    @Param('tenantId') tenantId: string,
    @Param('extensionId') extensionId: string,
    @Body() body: unknown,
  ) {
    const parsed = UpdateExtensionRecordingPolicySchema.parse(body);
    return this.extensionsService.updateRecordingPolicy(
      req.user!,
      tenantId,
      extensionId,
      parsed.recordingPolicyMode,
    );
  }

  @Delete(':extensionId')
  @RequirePermissions(Permission.TENANT_EXTENSION_MANAGE)
  async delete(
    @Req() req: RequestWithUser,
    @Param('tenantId') tenantId: string,
    @Param('extensionId') extensionId: string,
  ) {
    return this.extensionsService.deleteExtension(req.user!, tenantId, extensionId);
  }
}
