import { Body, Controller, Get, Inject, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { CreateTenantRequestSchema, Permission } from '@pbx/contracts';
import { UpdateTenantLifecycleSchema } from '@pbx/contracts';
import type { RequestWithUser } from '../../common/guards/auth.guard.js';
import {
  RequireAnyPermission,
  RequirePermissions,
} from '../../common/guards/auth.guard.js';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { TenantsService } from './tenants.service.js';

@Controller('tenants')
export class TenantsController {
  constructor(@Inject(TenantsService) private readonly tenantsService: TenantsService) {}

  @Post()
  @RequirePermissions(Permission.PLATFORM_TENANT_CREATE)
  async create(@Req() req: RequestWithUser, @Body() body: unknown) {
    const parsed = CreateTenantRequestSchema.parse(body);
    return this.tenantsService.createTenant(req.user!, parsed);
  }

  @Get()
  @RequirePermissions(Permission.PLATFORM_TENANT_READ)
  async list(@Req() req: RequestWithUser) {
    return this.tenantsService.listTenants(req.user!);
  }

  @Get('customers/summary')
  @RequirePermissions(Permission.PLATFORM_TENANT_READ)
  async listCustomers(@Req() req: RequestWithUser) {
    return this.tenantsService.listPlatformCustomers(req.user!);
  }

  @Patch(':tenantId/lifecycle')
  @RequirePermissions(Permission.PLATFORM_TENANT_UPDATE)
  async updateLifecycle(
    @Req() req: RequestWithUser,
    @Param('tenantId') tenantId: string,
    @Body() body: unknown,
  ) {
    const parsed = UpdateTenantLifecycleSchema.parse(body);
    return this.tenantsService.updateTenantLifecycle(req.user!, tenantId, parsed);
  }

  @Get(':tenantId')
  @UseGuards(TenantGuard)
  @RequireAnyPermission(Permission.TENANT_READ, Permission.PLATFORM_TENANT_READ)
  async get(@Req() req: RequestWithUser, @Param('tenantId') tenantId: string) {
    return this.tenantsService.getTenant(req.user!, tenantId);
  }
}
