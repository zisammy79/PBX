import { Body, Controller, Get, Headers, Inject, Post, Req, UseGuards } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { Permission, StripeConnectSchema, StripeTestPaymentSchema } from '@pbx/contracts';
import type { RequestWithUser } from '../../common/guards/auth.guard.js';
import { RequirePermissions } from '../../common/guards/auth.guard.js';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { StripeService } from './stripe.service.js';

@Controller('stripe')
export class StripeController {
  constructor(@Inject(StripeService) private readonly service: StripeService) {}

  @Get('status')
  async status() {
    return {
      mode: await this.service.mode(),
      label: await this.service.statusLabel(),
    };
  }

  @Get('contract')
  contract() {
    return this.service.contractManifest();
  }

  @Post('connect')
  @UseGuards(TenantGuard)
  @RequirePermissions(Permission.TENANT_BILLING_MANAGE)
  connect(@Req() req: RequestWithUser, @Body() body: unknown) {
    return this.service.connectTenant(req.user!, req.activeTenantId!, StripeConnectSchema.parse(body));
  }

  @Post('reconcile')
  @UseGuards(TenantGuard)
  @RequirePermissions(Permission.TENANT_BILLING_READ)
  reconcile(
    @Req() req: RequestWithUser,
    @Body() body: { periodStart: string; periodEnd: string },
  ) {
    return this.service.reconcileTenant(req.user!, req.activeTenantId!, body.periodStart, body.periodEnd);
  }

  @Post('test-payment')
  @UseGuards(TenantGuard)
  @RequirePermissions(Permission.TENANT_BILLING_MANAGE)
  testPayment(@Req() req: RequestWithUser, @Body() body: unknown) {
    const input = StripeTestPaymentSchema.parse(body);
    return this.service.simulateTestPayment(req.user!, req.activeTenantId!, input.simulateFailure);
  }

  @Post('webhook')
  async webhook(
    @Req() req: RawBodyRequest<RequestWithUser>,
    @Headers('stripe-signature') signature: string,
    @Body() body: Record<string, unknown>,
  ) {
    const raw = typeof req.rawBody === 'string' ? req.rawBody : JSON.stringify(body);
    const tenantId = typeof body.metadata === 'object' && body.metadata && 'tenantId' in body.metadata
      ? String((body.metadata as Record<string, unknown>).tenantId)
      : null;
    const valid = await this.service.verifyWebhookSignature(raw, signature ?? '', tenantId ?? undefined);
    if (!valid && (await this.service.mode(tenantId ?? undefined)) === 'TEST') {
      return { received: false, reason: 'invalid_signature' };
    }
    const eventId = String(body.id ?? `evt_${Date.now()}`);
    const eventType = String(body.type ?? 'unknown');
    return this.service.processWebhookEvent(tenantId, eventId, eventType, body);
  }
}
