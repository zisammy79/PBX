import { Controller, Inject, Post, Req, UseGuards } from '@nestjs/common';
import { Permission } from '@pbx/contracts';
import type { RequestWithUser } from '../../common/guards/auth.guard.js';
import { RequirePermissions } from '../../common/guards/auth.guard.js';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { TelephonyService } from './telephony.service.js';

@Controller('telephony/configuration')
@UseGuards(TenantGuard)
export class TelephonyController {
  constructor(@Inject(TelephonyService) private readonly telephonyService: TelephonyService) {}

  @Post('validate')
  @RequirePermissions(Permission.TENANT_EXTENSION_MANAGE)
  async validate(@Req() req: RequestWithUser) {
    return this.telephonyService.validateConfiguration(req.user!, req.activeTenantId!);
  }

  @Post('activate')
  @RequirePermissions(Permission.TENANT_EXTENSION_MANAGE)
  async activate(@Req() req: RequestWithUser) {
    return this.telephonyService.activateConfiguration(req.user!, req.activeTenantId!);
  }
}
