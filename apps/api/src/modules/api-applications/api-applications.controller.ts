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
import { ApiApplicationsService } from './api-applications.service.js';

@Controller('api-applications')
@UseGuards(TenantGuard)
export class ApiApplicationsController {
  constructor(@Inject(ApiApplicationsService) private readonly service: ApiApplicationsService) {}

  @Post()
  @RequirePermissions(Permission.TENANT_APIKEY_MANAGE)
  async create(@Req() req: RequestWithUser, @Body() body: unknown) {
    return this.service.createApplication(req.user!, req.activeTenantId!, body);
  }

  @Get()
  @RequirePermissions(Permission.TENANT_APIKEY_MANAGE)
  async list(@Req() req: RequestWithUser) {
    return this.service.listApplications(req.user!, req.activeTenantId!);
  }

  @Get(':id')
  @RequirePermissions(Permission.TENANT_APIKEY_MANAGE)
  async get(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.service.getApplication(req.user!, req.activeTenantId!, id);
  }

  @Patch(':id')
  @RequirePermissions(Permission.TENANT_APIKEY_MANAGE)
  async update(@Req() req: RequestWithUser, @Param('id') id: string, @Body() body: unknown) {
    return this.service.updateApplication(req.user!, req.activeTenantId!, id, body);
  }

  @Delete(':id')
  @RequirePermissions(Permission.TENANT_APIKEY_MANAGE)
  async remove(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.service.deleteApplication(req.user!, req.activeTenantId!, id);
  }

  @Post(':id/keys')
  @RequirePermissions(Permission.TENANT_APIKEY_MANAGE)
  async createKey(@Req() req: RequestWithUser, @Param('id') id: string, @Body() body: unknown) {
    return this.service.createKey(req.user!, req.activeTenantId!, id, body);
  }

  @Get(':id/keys')
  @RequirePermissions(Permission.TENANT_APIKEY_MANAGE)
  async listKeys(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.service.listKeys(req.user!, req.activeTenantId!, id);
  }

  @Post(':id/keys/:keyId/rotate')
  @RequirePermissions(Permission.TENANT_APIKEY_MANAGE)
  async rotateKey(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Param('keyId') keyId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.service.rotateKey(req.user!, req.activeTenantId!, id, keyId, body, idempotencyKey);
  }

  @Post(':id/keys/:keyId/revoke')
  @RequirePermissions(Permission.TENANT_APIKEY_MANAGE)
  async revokeKey(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Param('keyId') keyId: string,
  ) {
    return this.service.revokeKey(req.user!, req.activeTenantId!, id, keyId);
  }
}
