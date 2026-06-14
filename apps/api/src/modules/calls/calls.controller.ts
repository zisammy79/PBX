import { Controller, Get, Inject, Param, Query, Req, UseGuards } from '@nestjs/common';
import { PaginationQuerySchema, Permission } from '@pbx/contracts';
import type { RequestWithUser } from '../../common/guards/auth.guard.js';
import { RequireAnyPermission } from '../../common/guards/auth.guard.js';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { CallsService } from './calls.service.js';
import { ExtensionRegistrationService } from './extension-registration.service.js';

@Controller()
@UseGuards(TenantGuard)
export class CallsController {
  constructor(
    @Inject(CallsService) private readonly callsService: CallsService,
    @Inject(ExtensionRegistrationService)
    private readonly extensionRegistrationService: ExtensionRegistrationService,
  ) {}

  @Get('calls')
  @RequireAnyPermission(Permission.TENANT_CALL_READ, Permission.PLATFORM_TENANT_READ)
  async list(@Req() req: RequestWithUser, @Query() query: unknown) {
    const tenantId = req.activeTenantId!;
    const parsed = PaginationQuerySchema.parse(query);
    return this.callsService.listCalls(req.user!, tenantId, parsed);
  }

  @Get('calls/active')
  @RequireAnyPermission(Permission.TENANT_CALL_READ, Permission.PLATFORM_TENANT_READ)
  async listActive(@Req() req: RequestWithUser) {
    return this.callsService.listActiveCalls(req.user!, req.activeTenantId!);
  }

  @Get('calls/:id')
  @RequireAnyPermission(Permission.TENANT_CALL_READ, Permission.PLATFORM_TENANT_READ)
  async get(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.callsService.getCall(req.user!, req.activeTenantId!, id);
  }

  @Get('extensions/registration-status')
  @RequireAnyPermission(Permission.TENANT_EXTENSION_MANAGE, Permission.TENANT_CALL_READ)
  async registrationBatch(@Req() req: RequestWithUser) {
    return this.extensionRegistrationService.getBatchRegistrationStatus(
      req.user!,
      req.activeTenantId!,
    );
  }

  @Get('extensions/:id/registration')
  @RequireAnyPermission(Permission.TENANT_EXTENSION_MANAGE, Permission.TENANT_CALL_READ)
  async registration(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.extensionRegistrationService.getRegistrationStatusForExtension(
      req.user!,
      req.activeTenantId!,
      id,
    );
  }
}
