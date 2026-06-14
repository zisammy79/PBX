import {
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Query,
  Req,
  Res,
  UseGuards,
  Body,
} from '@nestjs/common';
import {
  PaginationQuerySchema,
  Permission,
  UpdateTenantTelephonySettingsSchema,
} from '@pbx/contracts';
import type { RequestWithUser } from '../../common/guards/auth.guard.js';
import { RequireAnyPermission, RequirePermissions } from '../../common/guards/auth.guard.js';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { RecordingsService } from './recordings.service.js';
import { TenantTelephonySettingsService } from '../telephony/tenant-telephony-settings.service.js';

type StreamResponse = {
  status(code: number): StreamResponse;
  setHeader(name: string, value: string | number): void;
  json(body: unknown): void;
  end(): void;
};

@Controller('tenants/:tenantId')
@UseGuards(TenantGuard)
export class RecordingsController {
  constructor(
    @Inject(RecordingsService) private readonly recordingsService: RecordingsService,
    @Inject(TenantTelephonySettingsService)
    private readonly tenantTelephonySettingsService: TenantTelephonySettingsService,
  ) {}

  @Get('settings/telephony')
  @RequireAnyPermission(Permission.TENANT_UPDATE, Permission.TENANT_EXTENSION_MANAGE)
  async getTelephonySettings(@Req() req: RequestWithUser, @Param('tenantId') tenantId: string) {
    return this.tenantTelephonySettingsService.getSettings(req.user!, tenantId);
  }

  @Patch('settings/telephony')
  @RequireAnyPermission(Permission.TENANT_UPDATE, Permission.TENANT_EXTENSION_MANAGE)
  async updateTelephonySettings(
    @Req() req: RequestWithUser,
    @Param('tenantId') tenantId: string,
    @Body() body: unknown,
  ) {
    const parsed = UpdateTenantTelephonySettingsSchema.parse(body);
    return this.tenantTelephonySettingsService.updateSettings(req.user!, tenantId, parsed);
  }

  @Get('calls/:callId/recordings')
  @RequireAnyPermission(Permission.TENANT_RECORDING_READ)
  async listForCall(
    @Req() req: RequestWithUser,
    @Param('tenantId') tenantId: string,
    @Param('callId') callId: string,
  ) {
    return this.recordingsService.listCallRecordings(req.user!, tenantId, callId);
  }

  @Get('extensions/:extensionId/recordings')
  @RequireAnyPermission(Permission.TENANT_RECORDING_READ, Permission.TENANT_EXTENSION_MANAGE)
  async listForExtension(
    @Req() req: RequestWithUser,
    @Param('tenantId') tenantId: string,
    @Param('extensionId') extensionId: string,
    @Query() query: unknown,
  ) {
    const parsed = PaginationQuerySchema.parse(query);
    return this.recordingsService.listExtensionRecordings(
      req.user!,
      tenantId,
      extensionId,
      parsed,
    );
  }

  @Get('recordings/:recordingId/content')
  @RequireAnyPermission(Permission.TENANT_RECORDING_READ, Permission.TENANT_EXTENSION_MANAGE)
  async streamContent(
    @Req() req: RequestWithUser & { headers: { range?: string } },
    @Res() res: StreamResponse,
    @Param('tenantId') tenantId: string,
    @Param('recordingId') recordingId: string,
  ) {
    await this.recordingsService.streamRecordingContent(
      req.user!,
      tenantId,
      recordingId,
      req.headers.range,
      res,
    );
  }

  @Get('recordings/:recordingId/play')
  @RequireAnyPermission(Permission.TENANT_RECORDING_READ, Permission.TENANT_EXTENSION_MANAGE)
  async play(
    @Req() req: RequestWithUser,
    @Param('tenantId') tenantId: string,
    @Param('recordingId') recordingId: string,
  ) {
    return this.recordingsService.createPlaybackDescriptor(req.user!, tenantId, recordingId);
  }
}
