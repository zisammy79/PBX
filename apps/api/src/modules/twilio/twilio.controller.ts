import { Body, Controller, Get, Inject, Param, Post, Req } from '@nestjs/common';
import {
  AssignExistingTwilioNumberSchema,
  Permission,
  ProvisionTenantPhoneNumberSchema,
  PurchaseTwilioNumberSchema,
} from '@pbx/contracts';
import type { RequestWithUser } from '../../common/guards/auth.guard.js';
import { RequireAnyPermission, RequirePermissions } from '../../common/guards/auth.guard.js';
import { TwilioProvisioningService } from './twilio-provisioning.service.js';
import { TwilioService } from './twilio.service.js';

@Controller('twilio')
export class TwilioController {
  constructor(
    @Inject(TwilioService) private readonly twilioService: TwilioService,
    @Inject(TwilioProvisioningService) private readonly provisioningService: TwilioProvisioningService,
  ) {}

  @Get('status')
  @RequireAnyPermission(Permission.PLATFORM_INTEGRATIONS_READ, Permission.PLATFORM_INTEGRATIONS_MANAGE)
  status() {
    return this.twilioService.getStatus();
  }

  @Post('validate')
  @RequirePermissions(Permission.PLATFORM_INTEGRATIONS_VALIDATE)
  async validate() {
    if (!this.twilioService.isConfigured()) {
      return { ok: false, configured: false };
    }
    return this.twilioService.validateCredentials();
  }

  @Get('trunk')
  @RequireAnyPermission(Permission.PLATFORM_INTEGRATIONS_READ, Permission.PLATFORM_INTEGRATIONS_MANAGE)
  async trunk() {
    if (!this.twilioService.isConfigured()) {
      return { configured: false };
    }
    return this.twilioService.getTrunkStatus();
  }

  @Post('trunk/sync')
  @RequirePermissions(Permission.PLATFORM_INTEGRATIONS_MANAGE)
  async syncTrunk() {
    return this.twilioService.syncTrunk();
  }

  @Get('numbers')
  @RequireAnyPermission(Permission.PLATFORM_INTEGRATIONS_READ, Permission.PLATFORM_INTEGRATIONS_MANAGE)
  async numbers() {
    if (!this.twilioService.isConfigured()) {
      return { configured: false, numbers: [] };
    }
    const numbers = await this.twilioService.listOwnedNumbers();
    return { numbers };
  }

  @Post('numbers/assign-existing')
  @RequirePermissions(Permission.PLATFORM_INTEGRATIONS_MANAGE)
  async assignExisting(@Req() req: RequestWithUser, @Body() body: unknown) {
    const parsed = AssignExistingTwilioNumberSchema.parse(body);
    return this.provisioningService.assignExistingNumber(
      req.user!,
      parsed.tenantId,
      parsed.e164,
      parsed.inboundDestinationExtensionNumber,
    );
  }

  @Post('numbers/purchase-and-assign')
  @RequirePermissions(Permission.PLATFORM_INTEGRATIONS_MANAGE)
  async purchaseAndAssign(@Req() req: RequestWithUser, @Body() body: unknown) {
    const parsed = PurchaseTwilioNumberSchema.parse(body);
    return this.provisioningService.purchaseAndAssign(
      req.user!,
      parsed.tenantId,
      parsed.inboundDestinationExtensionNumber,
    );
  }

  /** Tenant-scoped phone provisioning (maps to detailed-order DID assignment in current architecture). */
  @Post('tenants/:tenantId/provision-phone-number')
  @RequirePermissions(Permission.PLATFORM_INTEGRATIONS_MANAGE)
  async provisionTenantPhone(
    @Req() req: RequestWithUser,
    @Param('tenantId') tenantId: string,
    @Body() body: unknown,
  ) {
    const parsed = ProvisionTenantPhoneNumberSchema.parse(body ?? {});
    return this.provisioningService.provisionPhoneNumberForTenant(req.user!, tenantId, {
      ...(parsed.inboundDestinationExtensionNumber
        ? { inboundDestinationExtensionNumber: parsed.inboundDestinationExtensionNumber }
        : {}),
      ...(parsed.force ? { force: parsed.force } : {}),
    });
  }

  @Get('tenants/:tenantId/provisioning')
  @RequireAnyPermission(Permission.PLATFORM_INTEGRATIONS_READ, Permission.PLATFORM_INTEGRATIONS_MANAGE)
  async tenantProvisioning(@Param('tenantId') tenantId: string) {
    return this.provisioningService.getProvisioningState(tenantId);
  }
}

/** Alias route shape requested for order provisioning — orderId is tenantId until a billing order entity exists. */
@Controller('orders')
export class TwilioOrdersController {
  constructor(@Inject(TwilioProvisioningService) private readonly provisioningService: TwilioProvisioningService) {}

  @Post(':orderId/provision-phone-number')
  @RequirePermissions(Permission.PLATFORM_INTEGRATIONS_MANAGE)
  async provisionOrderPhone(
    @Req() req: RequestWithUser,
    @Param('orderId') orderId: string,
    @Body() body: unknown,
  ) {
    const parsed = ProvisionTenantPhoneNumberSchema.parse(body ?? {});
    return this.provisioningService.provisionPhoneNumberForTenant(req.user!, orderId, {
      ...(parsed.inboundDestinationExtensionNumber
        ? { inboundDestinationExtensionNumber: parsed.inboundDestinationExtensionNumber }
        : {}),
      ...(parsed.force ? { force: parsed.force } : {}),
    });
  }
}
