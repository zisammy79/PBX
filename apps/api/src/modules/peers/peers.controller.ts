import { Controller, Inject, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Permission } from '@pbx/contracts';
import type { RequestWithUser } from '../../common/guards/auth.guard.js';
import { RequirePermissions } from '../../common/guards/auth.guard.js';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { PeersService } from './peers.service.js';

@Controller('tenants/:tenantId/peers')
@UseGuards(TenantGuard)
export class PeersController {
  constructor(@Inject(PeersService) private readonly peersService: PeersService) {}

  @Post(':endpointId/unregister')
  @RequirePermissions(Permission.TENANT_PEER_OPERATE)
  async unregister(
    @Req() req: RequestWithUser,
    @Param('tenantId') tenantId: string,
    @Param('endpointId') endpointId: string,
  ) {
    return this.peersService.unregisterPeer(req.user!, tenantId, endpointId);
  }
}
