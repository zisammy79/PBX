import { Body, Controller, Get, Inject, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { CreateTenantRequestSchema, Permission, ProvisionTenantPhoneNumberSchema, ProvisionTenantRequestSchema, UpdateTenantFeatureSettingsSchema } from '@pbx/contracts';
import { UpdateTenantLifecycleSchema } from '@pbx/contracts';
import type { RequestWithUser } from '../../common/guards/auth.guard.js';
import {
  RequireAnyPermission,
  RequirePermissions,
} from '../../common/guards/auth.guard.js';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { TenantLimitsService } from './tenant-limits.service.js';
import { TenantProvisioningService } from './tenant-provisioning.service.js';
import { TenantSettingsService } from './tenant-settings.service.js';
import { TenantsService } from './tenants.service.js';
import { TwilioNumbersService } from '../twilio/twilio-numbers.service.js';
import { TwilioProvisioningService } from '../twilio/twilio-provisioning.service.js';

@Controller('tenants')
export class TenantsController {
  constructor(
    @Inject(TenantsService) private readonly tenantsService: TenantsService,
    @Inject(TenantLimitsService) private readonly tenantLimitsService: TenantLimitsService,
    @Inject(TenantProvisioningService) private readonly tenantProvisioningService: TenantProvisioningService,
    @Inject(TwilioProvisioningService) private readonly twilioProvisioningService: TwilioProvisioningService,
    @Inject(TwilioNumbersService) private readonly twilioNumbersService: TwilioNumbersService,
    @Inject(TenantSettingsService) private readonly tenantSettingsService: TenantSettingsService,
  ) {}

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

  @Get(':tenantId/provisioning')
  @RequirePermissions(Permission.PLATFORM_TENANT_READ)
  async getProvisioning(@Param('tenantId') tenantId: string) {
    return this.tenantProvisioningService.getState(tenantId);
  }

  @Post(':tenantId/provision')
  @RequirePermissions(Permission.PLATFORM_TENANT_UPDATE)
  async provision(@Req() req: RequestWithUser, @Param('tenantId') tenantId: string, @Body() body: unknown) {
    const parsed = ProvisionTenantRequestSchema.parse(body ?? {});
    return this.tenantProvisioningService.provision(req.user!, tenantId, parsed);
  }

  @Post(':tenantId/provision-phone-number')
  @RequirePermissions(Permission.PLATFORM_TENANT_UPDATE)
  async provisionPhoneNumber(
    @Req() req: RequestWithUser,
    @Param('tenantId') tenantId: string,
    @Body() body: unknown,
  ) {
    const parsed = ProvisionTenantPhoneNumberSchema.parse(body ?? {});
    return this.twilioProvisioningService.provisionPhoneNumberForTenant(req.user!, tenantId, {
      ...(parsed.inboundDestinationExtensionNumber
        ? { inboundDestinationExtensionNumber: parsed.inboundDestinationExtensionNumber }
        : {}),
      ...(parsed.force ? { force: parsed.force } : {}),
    });
  }

  @Get(':tenantId/phone-numbers')
  @UseGuards(TenantGuard)
  @RequireAnyPermission(
    Permission.TENANT_NUMBER_MANAGE,
    Permission.PLATFORM_INTEGRATIONS_READ,
    Permission.PLATFORM_INTEGRATIONS_MANAGE,
  )
  async listPhoneNumbers(@Req() req: RequestWithUser, @Param('tenantId') _tenantId: string) {
    const tenantId = req.activeTenantId!;
    const numbers = await this.twilioNumbersService.listTenantPhoneNumbers(tenantId);
    return { numbers };
  }

  @Get(':tenantId/assignable-destinations')
  @UseGuards(TenantGuard)
  @RequireAnyPermission(
    Permission.TENANT_NUMBER_MANAGE,
    Permission.PLATFORM_INTEGRATIONS_READ,
    Permission.PLATFORM_INTEGRATIONS_MANAGE,
  )
  async listAssignableDestinations(@Req() req: RequestWithUser, @Param('tenantId') _tenantId: string) {
    return this.twilioNumbersService.listAssignableDestinations(req.activeTenantId!);
  }

  @Get(':tenantId/settings')
  @UseGuards(TenantGuard)
  @RequireAnyPermission(Permission.TENANT_UPDATE, Permission.PLATFORM_TENANT_UPDATE)
  async getSettings(@Req() req: RequestWithUser, @Param('tenantId') tenantId: string) {
    return this.tenantSettingsService.getSettings(req.user!, tenantId);
  }

  @Patch(':tenantId/settings')
  @UseGuards(TenantGuard)
  @RequireAnyPermission(Permission.TENANT_UPDATE, Permission.PLATFORM_TENANT_UPDATE)
  async updateSettings(
    @Req() req: RequestWithUser,
    @Param('tenantId') tenantId: string,
    @Body() body: unknown,
  ) {
    const parsed = UpdateTenantFeatureSettingsSchema.parse(body);
    return this.tenantSettingsService.updateSettings(req.user!, tenantId, parsed);
  }

  @Get(':tenantId/entitlements')
  @UseGuards(TenantGuard)
  @RequireAnyPermission(Permission.TENANT_READ, Permission.PLATFORM_TENANT_READ)
  async entitlements(@Req() req: RequestWithUser, @Param('tenantId') tenantId: string) {
    return this.tenantLimitsService.getUsageSummary(tenantId);
  }

  @Get(':tenantId')
  @UseGuards(TenantGuard)
  @RequireAnyPermission(Permission.TENANT_READ, Permission.PLATFORM_TENANT_READ)
  async get(@Req() req: RequestWithUser, @Param('tenantId') tenantId: string) {
    return this.tenantsService.getTenant(req.user!, tenantId);
  }
}
