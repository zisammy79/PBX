import { Body, Controller, Get, Inject, Post, Req, UseGuards } from '@nestjs/common';
import {
  CreateInboundRouteSchema,
  CreateOutboundRouteSchema,
  CreateSipTrunkSchema,
  Permission,
} from '@pbx/contracts';
import type { RequestWithUser } from '../../common/guards/auth.guard.js';
import { RequirePermissions } from '../../common/guards/auth.guard.js';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { PstnService } from './pstn.service.js';

@Controller('pstn')
@UseGuards(TenantGuard)
export class PstnController {
  constructor(@Inject(PstnService) private readonly service: PstnService) {}

  @Post('trunks')
  @RequirePermissions(Permission.TENANT_TRUNK_MANAGE)
  createTrunk(@Req() req: RequestWithUser, @Body() body: unknown) {
    return this.service.createTrunk(req.user!, req.activeTenantId!, CreateSipTrunkSchema.parse(body));
  }

  @Get('trunks')
  @RequirePermissions(Permission.TENANT_TRUNK_MANAGE)
  listTrunks(@Req() req: RequestWithUser) {
    return this.service.listTrunks(req.user!, req.activeTenantId!);
  }

  @Get('validate')
  @RequirePermissions(Permission.TENANT_TRUNK_MANAGE)
  validate(@Req() req: RequestWithUser) {
    return this.service.validateConfiguration(req.user!, req.activeTenantId!);
  }

  @Post('normalize')
  @RequirePermissions(Permission.TENANT_TRUNK_MANAGE)
  normalize(@Req() req: RequestWithUser, @Body() body: { number: string }) {
    return this.service.normalizeNumber(req.user!, req.activeTenantId!, body.number);
  }

  @Post('inbound-routes')
  @RequirePermissions(Permission.TENANT_TRUNK_MANAGE)
  createInbound(@Req() req: RequestWithUser, @Body() body: unknown) {
    return this.service.createInboundRoute(
      req.user!,
      req.activeTenantId!,
      CreateInboundRouteSchema.parse(body),
    );
  }

  @Post('outbound-routes')
  @RequirePermissions(Permission.TENANT_TRUNK_MANAGE)
  createOutbound(@Req() req: RequestWithUser, @Body() body: unknown) {
    return this.service.createOutboundRoute(
      req.user!,
      req.activeTenantId!,
      CreateOutboundRouteSchema.parse(body),
    );
  }
}
