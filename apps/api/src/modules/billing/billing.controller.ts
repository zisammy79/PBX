import { Body, Controller, Get, Inject, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import {
  CreatePlanSchema,
  CreatePriceSchema,
  CreditAdjustmentSchema,
  InvoiceGenerateSchema,
  InvoicePreviewSchema,
  Permission,
  UpdatePlanSchema,
  UpdatePriceSchema,
} from '@pbx/contracts';
import type { RequestWithUser } from '../../common/guards/auth.guard.js';
import { RequireAnyPermission, RequirePermissions } from '../../common/guards/auth.guard.js';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { readIdempotencyKey } from '../../common/http/idempotency-key.js';
import { BillingService } from './billing.service.js';

@Controller()
export class BillingController {
  constructor(@Inject(BillingService) private readonly service: BillingService) {}

  @Get('billing/subscription')
  @UseGuards(TenantGuard)
  @RequirePermissions(Permission.TENANT_BILLING_READ)
  async getSubscription(@Req() req: RequestWithUser) {
    return this.service.getSubscription(req.user!, req.activeTenantId!);
  }

  @Get('plans')
  @RequireAnyPermission(Permission.TENANT_BILLING_READ, Permission.PLATFORM_BILLING_READ)
  async listPlans(@Req() req: RequestWithUser) {
    return this.service.listPlans(req.user!);
  }

  @Get('plans/:id')
  @RequireAnyPermission(Permission.TENANT_BILLING_READ, Permission.PLATFORM_BILLING_READ)
  async getPlan(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.service.getPlan(req.user!, id);
  }

  @Post('plans')
  @RequirePermissions(Permission.PLATFORM_BILLING_READ)
  async createPlan(@Req() req: RequestWithUser, @Body() body: unknown) {
    return this.service.createPlan(req.user!, CreatePlanSchema.parse(body));
  }

  @Patch('plans/:id')
  @RequirePermissions(Permission.PLATFORM_BILLING_READ)
  async updatePlan(@Req() req: RequestWithUser, @Param('id') id: string, @Body() body: unknown) {
    return this.service.updatePlan(req.user!, id, UpdatePlanSchema.parse(body));
  }

  @Get('prices')
  @RequireAnyPermission(Permission.TENANT_BILLING_READ, Permission.PLATFORM_BILLING_READ)
  async listPrices(@Req() req: RequestWithUser, @Query('priceBookId') priceBookId?: string) {
    return this.service.listPrices(req.user!, priceBookId);
  }

  @Get('prices/:id')
  @RequireAnyPermission(Permission.TENANT_BILLING_READ, Permission.PLATFORM_BILLING_READ)
  async getPrice(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.service.getPrice(req.user!, id);
  }

  @Post('prices')
  @RequirePermissions(Permission.PLATFORM_BILLING_READ)
  async createPrice(@Req() req: RequestWithUser, @Body() body: unknown) {
    return this.service.createPrice(req.user!, CreatePriceSchema.parse(body));
  }

  @Patch('prices/:id')
  @RequirePermissions(Permission.PLATFORM_BILLING_READ)
  async updatePrice(@Req() req: RequestWithUser, @Param('id') id: string, @Body() body: unknown) {
    return this.service.updatePrice(req.user!, id, UpdatePriceSchema.parse(body));
  }

  @Get('usage')
  @UseGuards(TenantGuard)
  @RequirePermissions(Permission.TENANT_USAGE_READ)
  async listUsage(
    @Req() req: RequestWithUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.listUsage(req.user!, req.activeTenantId!, from, to);
  }

  @Get('rated-usage')
  @UseGuards(TenantGuard)
  @RequirePermissions(Permission.TENANT_BILLING_READ)
  async listRatedUsage(
    @Req() req: RequestWithUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.listRatedUsage(req.user!, req.activeTenantId!, from, to);
  }

  @Post('billing/rate')
  @UseGuards(TenantGuard)
  @RequirePermissions(Permission.TENANT_BILLING_MANAGE)
  async rateUsage(@Req() req: RequestWithUser) {
    return this.service.rateTenantUsage(req.user!, req.activeTenantId!);
  }

  @Get('credits')
  @UseGuards(TenantGuard)
  @RequirePermissions(Permission.TENANT_BILLING_READ)
  async listCredits(@Req() req: RequestWithUser) {
    return this.service.listCredits(req.user!, req.activeTenantId!);
  }

  @Post('credits/adjustments')
  @UseGuards(TenantGuard)
  @RequirePermissions(Permission.TENANT_BILLING_MANAGE)
  async creditAdjustment(@Req() req: RequestWithUser, @Body() body: unknown) {
    const parsed = CreditAdjustmentSchema.parse(body);
    return this.service.applyCreditAdjustment(req.user!, req.activeTenantId!, {
      ...parsed,
      idempotencyKey: readIdempotencyKey(req, parsed.idempotencyKey),
    });
  }

  @Get('invoices')
  @UseGuards(TenantGuard)
  @RequirePermissions(Permission.TENANT_BILLING_READ)
  async listInvoices(@Req() req: RequestWithUser, @Query('status') status?: string) {
    return this.service.listInvoices(req.user!, req.activeTenantId!, status);
  }

  @Post('invoices/preview')
  @UseGuards(TenantGuard)
  @RequirePermissions(Permission.TENANT_BILLING_READ)
  async previewInvoice(@Req() req: RequestWithUser, @Body() body: unknown) {
    return this.service.previewInvoice(req.user!, req.activeTenantId!, InvoicePreviewSchema.parse(body));
  }

  @Post('invoices/generate')
  @UseGuards(TenantGuard)
  @RequirePermissions(Permission.TENANT_BILLING_MANAGE)
  async generateInvoice(@Req() req: RequestWithUser, @Body() body: unknown) {
    const parsed = InvoiceGenerateSchema.parse(body);
    return this.service.generateInvoice(req.user!, req.activeTenantId!, {
      ...parsed,
      idempotencyKey: readIdempotencyKey(req, parsed.idempotencyKey),
    });
  }

  @Get('invoices/:id')
  @UseGuards(TenantGuard)
  @RequirePermissions(Permission.TENANT_BILLING_READ)
  async getInvoice(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.service.getInvoice(req.user!, req.activeTenantId!, id);
  }

  @Post('invoices/:id/finalize')
  @UseGuards(TenantGuard)
  @RequirePermissions(Permission.TENANT_BILLING_MANAGE)
  async finalizeInvoice(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.service.finalizeInvoice(req.user!, req.activeTenantId!, id);
  }

  @Post('invoices/:id/void')
  @UseGuards(TenantGuard)
  @RequirePermissions(Permission.TENANT_BILLING_MANAGE)
  async voidInvoice(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.service.voidInvoice(req.user!, req.activeTenantId!, id);
  }
}
