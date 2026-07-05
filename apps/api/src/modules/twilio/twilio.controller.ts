import { Body, Controller, Get, Inject, Param, Post, Query, Req } from '@nestjs/common';
import {
  Permission,
  TwilioNumberAssignmentSchema,
  TwilioNumberSearchQuerySchema,
  TwilioPurchaseAndAssignSchema,
  TwilioPurchaseNumberSchema,
  AssignExistingTwilioNumberSchema,
  PurchaseTwilioNumberSchema,
  ProvisionTenantPhoneNumberSchema,
} from '@pbx/contracts';
import type { RequestWithUser } from '../../common/guards/auth.guard.js';
import { RequireAnyPermission, RequirePermissions } from '../../common/guards/auth.guard.js';
import { TwilioNumbersService } from './twilio-numbers.service.js';
import { TwilioProvisioningService } from './twilio-provisioning.service.js';
import { TwilioService } from './twilio.service.js';

@Controller('twilio')
export class TwilioController {
  constructor(
    @Inject(TwilioService) private readonly twilioService: TwilioService,
    @Inject(TwilioProvisioningService) private readonly provisioningService: TwilioProvisioningService,
    @Inject(TwilioNumbersService) private readonly numbersService: TwilioNumbersService,
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

  @Get('numbers/search')
  @RequireAnyPermission(Permission.PLATFORM_INTEGRATIONS_READ, Permission.PLATFORM_INTEGRATIONS_MANAGE)
  async searchNumbers(@Query() query: unknown) {
    this.numbersService.assertTwilioConfigured();
    const parsed = TwilioNumberSearchQuerySchema.parse(query);
    const result = await this.twilioService.searchAvailableNumbers(parsed);
    return {
      numbers: result.numbers,
      count: result.numbers.length,
      appliedFilters: result.appliedFilters,
    };
  }

  @Get('numbers/owned')
  @RequireAnyPermission(Permission.PLATFORM_INTEGRATIONS_READ, Permission.PLATFORM_INTEGRATIONS_MANAGE)
  async ownedNumbers() {
    if (!this.twilioService.isConfigured()) {
      return { configured: false, numbers: [] };
    }
    const numbers = await this.twilioService.listOwnedNumbers();
    return { numbers };
  }

  /** Legacy alias — prefer GET /twilio/numbers/owned */
  @Get('numbers')
  @RequireAnyPermission(Permission.PLATFORM_INTEGRATIONS_READ, Permission.PLATFORM_INTEGRATIONS_MANAGE)
  async numbers() {
    return this.ownedNumbers();
  }

  @Post('numbers/purchase')
  @RequirePermissions(Permission.PLATFORM_INTEGRATIONS_MANAGE)
  async purchaseNumber(@Req() req: RequestWithUser, @Body() body: unknown) {
    const parsed = TwilioPurchaseNumberSchema.parse(body);
    return this.numbersService.purchaseNumber(req.user!, {
      e164: parsed.e164,
      ...(parsed.friendlyName ? { friendlyName: parsed.friendlyName } : {}),
    });
  }

  @Post('numbers/:phoneNumberSid/attach-to-trunk')
  @RequirePermissions(Permission.PLATFORM_INTEGRATIONS_MANAGE)
  async attachToTrunk(
    @Req() req: RequestWithUser,
    @Param('phoneNumberSid') phoneNumberSid: string,
    @Body() body: unknown,
  ) {
    const tenantId =
      body && typeof body === 'object' && 'tenantId' in body && typeof body.tenantId === 'string'
        ? body.tenantId
        : undefined;
    return this.numbersService.attachToTrunk(req.user!, phoneNumberSid, tenantId);
  }

  @Post('numbers/:phoneNumberSid/assign')
  @RequirePermissions(Permission.PLATFORM_INTEGRATIONS_MANAGE)
  async assignNumber(
    @Req() req: RequestWithUser,
    @Param('phoneNumberSid') phoneNumberSid: string,
    @Body() body: unknown,
  ) {
    const parsed = TwilioNumberAssignmentSchema.parse(body);
    return this.numbersService.assignNumberToTenant(req.user!, phoneNumberSid, parsed);
  }

  @Post('numbers/purchase-and-assign')
  @RequirePermissions(Permission.PLATFORM_INTEGRATIONS_MANAGE)
  async purchaseAndAssign(@Req() req: RequestWithUser, @Body() body: unknown) {
    const parsed = TwilioPurchaseAndAssignSchema.parse(body);
    return this.numbersService.purchaseAndAssign(req.user!, parsed);
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

  /** Legacy one-click purchase (no explicit confirm flag) — use Phone Numbers UI for new flow. */
  @Post('numbers/purchase-and-assign-legacy')
  @RequirePermissions(Permission.PLATFORM_INTEGRATIONS_MANAGE)
  async purchaseAndAssignLegacy(@Req() req: RequestWithUser, @Body() body: unknown) {
    const parsed = PurchaseTwilioNumberSchema.parse(body);
    return this.provisioningService.purchaseAndAssign(
      req.user!,
      parsed.tenantId,
      parsed.inboundDestinationExtensionNumber,
    );
  }

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
