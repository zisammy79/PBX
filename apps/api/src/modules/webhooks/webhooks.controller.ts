import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Permission } from '@pbx/contracts';
import type { RequestWithUser } from '../../common/guards/auth.guard.js';
import { RequirePermissions } from '../../common/guards/auth.guard.js';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { WebhooksService } from './webhooks.service.js';

@Controller('webhooks')
@UseGuards(TenantGuard)
export class WebhooksController {
  constructor(@Inject(WebhooksService) private readonly service: WebhooksService) {}

  @Post()
  @RequirePermissions(Permission.TENANT_WEBHOOK_MANAGE)
  async create(
    @Req() req: RequestWithUser,
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.service.create(req.user!, req.activeTenantId!, body, idempotencyKey);
  }

  @Get()
  @RequirePermissions(Permission.TENANT_WEBHOOK_MANAGE)
  async list(@Req() req: RequestWithUser) {
    return this.service.list(req.user!, req.activeTenantId!);
  }

  @Get(':id')
  @RequirePermissions(Permission.TENANT_WEBHOOK_MANAGE)
  async get(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.service.get(req.user!, req.activeTenantId!, id);
  }

  @Patch(':id')
  @RequirePermissions(Permission.TENANT_WEBHOOK_MANAGE)
  async update(@Req() req: RequestWithUser, @Param('id') id: string, @Body() body: unknown) {
    return this.service.update(req.user!, req.activeTenantId!, id, body);
  }

  @Delete(':id')
  @RequirePermissions(Permission.TENANT_WEBHOOK_MANAGE)
  async remove(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.service.remove(req.user!, req.activeTenantId!, id);
  }

  @Post(':id/rotate-secret')
  @RequirePermissions(Permission.TENANT_WEBHOOK_MANAGE)
  async rotateSecret(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.service.rotateSecret(req.user!, req.activeTenantId!, id);
  }

  @Get(':id/deliveries')
  @RequirePermissions(Permission.TENANT_WEBHOOK_MANAGE)
  async listDeliveries(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.service.listDeliveries(req.user!, req.activeTenantId!, id);
  }

  @Get(':id/deliveries/:deliveryId')
  @RequirePermissions(Permission.TENANT_WEBHOOK_MANAGE)
  async getDelivery(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Param('deliveryId') deliveryId: string,
  ) {
    return this.service.getDelivery(req.user!, req.activeTenantId!, id, deliveryId);
  }

  @Post(':id/deliveries/:deliveryId/redeliver')
  @RequirePermissions(Permission.TENANT_WEBHOOK_MANAGE)
  async redeliver(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Param('deliveryId') deliveryId: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.service.redeliver(req.user!, req.activeTenantId!, id, deliveryId, idempotencyKey);
  }
}
