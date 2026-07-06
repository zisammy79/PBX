import { Body, Controller, Get, Inject, Param, Post, Req } from '@nestjs/common';
import { Permission } from '@pbx/contracts';
import type { RequestWithUser } from '../../common/guards/auth.guard.js';
import { RequirePermissions } from '../../common/guards/auth.guard.js';
import { PlatformApiTokensService } from './platform-api-tokens.service.js';

@Controller('platform/api-tokens')
export class PlatformApiTokensController {
  constructor(
    @Inject(PlatformApiTokensService) private readonly service: PlatformApiTokensService,
  ) {}

  @Get()
  @RequirePermissions(Permission.PLATFORM_TENANT_UPDATE)
  async list(@Req() req: RequestWithUser) {
    return this.service.list(req.user!);
  }

  @Post()
  @RequirePermissions(Permission.PLATFORM_TENANT_UPDATE)
  async create(@Req() req: RequestWithUser, @Body() body: unknown) {
    return this.service.create(req.user!, body);
  }

  @Post(':id/rotate')
  @RequirePermissions(Permission.PLATFORM_TENANT_UPDATE)
  async rotate(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.service.rotate(req.user!, id, body);
  }

  @Post(':id/revoke')
  @RequirePermissions(Permission.PLATFORM_TENANT_UPDATE)
  async revoke(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.service.revoke(req.user!, id);
  }
}
