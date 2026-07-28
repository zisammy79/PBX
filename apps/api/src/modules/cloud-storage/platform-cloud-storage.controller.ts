import {
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { CloudStorageProviderSchema } from '@pbx/contracts';
import type { RequestWithUser } from '../../common/guards/auth.guard.js';
import { RequirePermissions } from '../../common/guards/auth.guard.js';
import { Permission } from '@pbx/contracts';
import type { FastifyReply } from 'fastify';
import { CloudStorageService } from './cloud-storage.service.js';

@Controller('platform/cloud-storage')
export class PlatformCloudStorageController {
  constructor(@Inject(CloudStorageService) private readonly service: CloudStorageService) {}

  @Get('connections')
  @RequirePermissions(Permission.PLATFORM_INTEGRATIONS_MANAGE)
  listConnections(@Req() req: RequestWithUser) {
    return this.service.listPlatformConnections(req.user!);
  }

  @Get('oauth/status')
  oauthStatus() {
    return this.service.getOAuthStatus();
  }

  @Get('oauth/:provider/start')
  @RequirePermissions(Permission.PLATFORM_INTEGRATIONS_MANAGE)
  startOAuth(
    @Req() req: RequestWithUser,
    @Param('provider') provider: string,
    @Query('displayName') displayName?: string,
    @Query('returnPath') returnPath?: string,
    @Query('tenantId') tenantId?: string,
  ) {
    const parsed = CloudStorageProviderSchema.parse(provider);
    const scopeType = tenantId ? 'tenant' : 'platform';
    return this.service.startOAuth(req.user!, {
      provider: parsed,
      scopeType,
      ...(tenantId ? { scopeId: tenantId } : {}),
      displayName: displayName?.trim() || `${parsed} connection`,
      ...(returnPath ? { returnPath } : {}),
    });
  }

  @Get('oauth/:provider/callback')
  async oauthCallback(
    @Param('provider') provider: string,
    @Query('code') code?: string,
    @Query('state') state?: string,
    @Res() res?: FastifyReply,
  ) {
    if (!code || !state) {
      return res!.status(400).send({ error: 'missing_code_or_state' });
    }
    const result = await this.service.completeOAuth(provider, code, state);
    return res!.redirect(result.redirectUrl, 302);
  }

  @Post('connections/:connectionId/assign/:tenantId')
  @RequirePermissions(Permission.PLATFORM_INTEGRATIONS_MANAGE)
  assign(
    @Req() req: RequestWithUser,
    @Param('connectionId') connectionId: string,
    @Param('tenantId') tenantId: string,
  ) {
    return this.service.assignConnectionToTenant(req.user!, connectionId, tenantId);
  }

  @Delete('connections/:connectionId/assign/:tenantId')
  @RequirePermissions(Permission.PLATFORM_INTEGRATIONS_MANAGE)
  unassign(
    @Req() req: RequestWithUser,
    @Param('connectionId') connectionId: string,
    @Param('tenantId') tenantId: string,
  ) {
    return this.service.unassignConnectionFromTenant(req.user!, connectionId, tenantId);
  }

  @Get('connections/:connectionId/assignments')
  @RequirePermissions(Permission.PLATFORM_INTEGRATIONS_MANAGE)
  listAssignments(@Req() req: RequestWithUser, @Param('connectionId') connectionId: string) {
    return this.service.listConnectionAssignments(req.user!, connectionId);
  }
}
