import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import {
  AddDncListNumberSchema,
  CreateBlacklistEntrySchema,
  CreateBusinessScheduleSchema,
  CreateConferenceSchema,
  CreateCustomDestinationSchema,
  CreateDncListSchema,
  CreateFeatureCodeSchema,
  CreateIvrSchema,
  CreateCampaignSchema,
  CreateMediaFileSchema,
  CreateMohClassSchema,
  CreatePagingGroupSchema,
  CreatePhonebookEntrySchema,
  CreateQueueSchema,
  CreateRingGroupSchema,
  CreateShortNumberSchema,
  CreateTelephonyCronJobSchema,
  ListPhonebookEntriesQuerySchema,
  ListVoicemailsQuerySchema,
  MarkVoicemailReadSchema,
  Permission,
  UpdateCampaignSchema,
  UpdateMohClassSchema,
  UpdateTelephonyCronJobSchema,
  UpdateBlacklistEntrySchema,
  UpdateBusinessScheduleSchema,
  UpdateConferenceSchema,
  UpdateCustomDestinationSchema,
  UpdateDncListSchema,
  UpdateFeatureCodeSchema,
  UpdateIvrSchema,
  UpdateMediaFileSchema,
  UpdatePagingGroupSchema,
  UpdatePhonebookEntrySchema,
  UpdateQueueSchema,
  UpdateRingGroupSchema,
  UpdateShortNumberSchema,
  UpdateTenantLocalesSchema,
} from '@pbx/contracts';
import type { RequestWithUser } from '../../common/guards/auth.guard.js';
import { RequireAnyPermission, RequirePermissions } from '../../common/guards/auth.guard.js';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { CallflowService } from './callflow.service.js';

@Controller('tenants/:tenantId')
@UseGuards(TenantGuard)
export class CallflowController {
  constructor(@Inject(CallflowService) private readonly callflowService: CallflowService) {}

  @Get('schedules')
  @RequirePermissions(Permission.TENANT_CALLFLOW_MANAGE)
  listSchedules(@Req() req: RequestWithUser, @Param('tenantId') tenantId: string) {
    return this.callflowService.listSchedules(req.user!, tenantId);
  }

  @Post('schedules')
  @RequirePermissions(Permission.TENANT_CALLFLOW_MANAGE)
  createSchedule(@Req() req: RequestWithUser, @Param('tenantId') tenantId: string, @Body() body: unknown) {
    return this.callflowService.createSchedule(req.user!, tenantId, CreateBusinessScheduleSchema.parse(body));
  }

  @Get('schedules/:id')
  @RequirePermissions(Permission.TENANT_CALLFLOW_MANAGE)
  getSchedule(@Req() req: RequestWithUser, @Param('tenantId') tenantId: string, @Param('id') id: string) {
    return this.callflowService.getSchedule(req.user!, tenantId, id);
  }

  @Patch('schedules/:id')
  @RequirePermissions(Permission.TENANT_CALLFLOW_MANAGE)
  patchSchedule(
    @Req() req: RequestWithUser,
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.callflowService.patchSchedule(req.user!, tenantId, id, UpdateBusinessScheduleSchema.parse(body));
  }

  @Delete('schedules/:id')
  @RequirePermissions(Permission.TENANT_CALLFLOW_MANAGE)
  deleteSchedule(@Req() req: RequestWithUser, @Param('tenantId') tenantId: string, @Param('id') id: string) {
    return this.callflowService.deleteSchedule(req.user!, tenantId, id);
  }

  @Get('ivrs')
  @RequirePermissions(Permission.TENANT_CALLFLOW_MANAGE)
  listIvrs(@Req() req: RequestWithUser, @Param('tenantId') tenantId: string) {
    return this.callflowService.listIvrs(req.user!, tenantId);
  }

  @Post('ivrs')
  @RequirePermissions(Permission.TENANT_CALLFLOW_MANAGE)
  createIvr(@Req() req: RequestWithUser, @Param('tenantId') tenantId: string, @Body() body: unknown) {
    return this.callflowService.createIvr(req.user!, tenantId, CreateIvrSchema.parse(body));
  }

  @Get('ivrs/:id')
  @RequirePermissions(Permission.TENANT_CALLFLOW_MANAGE)
  getIvr(@Req() req: RequestWithUser, @Param('tenantId') tenantId: string, @Param('id') id: string) {
    return this.callflowService.getIvr(req.user!, tenantId, id);
  }

  @Patch('ivrs/:id')
  @RequirePermissions(Permission.TENANT_CALLFLOW_MANAGE)
  patchIvr(
    @Req() req: RequestWithUser,
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.callflowService.patchIvr(req.user!, tenantId, id, UpdateIvrSchema.parse(body));
  }

  @Delete('ivrs/:id')
  @RequirePermissions(Permission.TENANT_CALLFLOW_MANAGE)
  deleteIvr(@Req() req: RequestWithUser, @Param('tenantId') tenantId: string, @Param('id') id: string) {
    return this.callflowService.deleteIvr(req.user!, tenantId, id);
  }

  @Get('queues')
  @RequirePermissions(Permission.TENANT_CALLFLOW_MANAGE)
  listQueues(@Req() req: RequestWithUser, @Param('tenantId') tenantId: string) {
    return this.callflowService.listQueues(req.user!, tenantId);
  }

  @Post('queues')
  @RequirePermissions(Permission.TENANT_CALLFLOW_MANAGE)
  createQueue(@Req() req: RequestWithUser, @Param('tenantId') tenantId: string, @Body() body: unknown) {
    return this.callflowService.createQueue(req.user!, tenantId, CreateQueueSchema.parse(body));
  }

  @Get('queues/:id')
  @RequirePermissions(Permission.TENANT_CALLFLOW_MANAGE)
  getQueue(@Req() req: RequestWithUser, @Param('tenantId') tenantId: string, @Param('id') id: string) {
    return this.callflowService.getQueue(req.user!, tenantId, id);
  }

  @Patch('queues/:id')
  @RequirePermissions(Permission.TENANT_CALLFLOW_MANAGE)
  patchQueue(
    @Req() req: RequestWithUser,
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.callflowService.patchQueue(req.user!, tenantId, id, UpdateQueueSchema.parse(body));
  }

  @Delete('queues/:id')
  @RequirePermissions(Permission.TENANT_CALLFLOW_MANAGE)
  deleteQueue(@Req() req: RequestWithUser, @Param('tenantId') tenantId: string, @Param('id') id: string) {
    return this.callflowService.deleteQueue(req.user!, tenantId, id);
  }

  @Get('ring-groups')
  @RequirePermissions(Permission.TENANT_CALLFLOW_MANAGE)
  listRingGroups(@Req() req: RequestWithUser, @Param('tenantId') tenantId: string) {
    return this.callflowService.listRingGroups(req.user!, tenantId);
  }

  @Post('ring-groups')
  @RequirePermissions(Permission.TENANT_CALLFLOW_MANAGE)
  createRingGroup(@Req() req: RequestWithUser, @Param('tenantId') tenantId: string, @Body() body: unknown) {
    return this.callflowService.createRingGroup(req.user!, tenantId, CreateRingGroupSchema.parse(body));
  }

  @Get('ring-groups/:id')
  @RequirePermissions(Permission.TENANT_CALLFLOW_MANAGE)
  getRingGroup(@Req() req: RequestWithUser, @Param('tenantId') tenantId: string, @Param('id') id: string) {
    return this.callflowService.getRingGroup(req.user!, tenantId, id);
  }

  @Patch('ring-groups/:id')
  @RequirePermissions(Permission.TENANT_CALLFLOW_MANAGE)
  patchRingGroup(
    @Req() req: RequestWithUser,
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.callflowService.patchRingGroup(req.user!, tenantId, id, UpdateRingGroupSchema.parse(body));
  }

  @Delete('ring-groups/:id')
  @RequirePermissions(Permission.TENANT_CALLFLOW_MANAGE)
  deleteRingGroup(@Req() req: RequestWithUser, @Param('tenantId') tenantId: string, @Param('id') id: string) {
    return this.callflowService.deleteRingGroup(req.user!, tenantId, id);
  }

  @Get('media-files')
  @RequirePermissions(Permission.TENANT_MEDIA_MANAGE)
  listMediaFiles(@Req() req: RequestWithUser, @Param('tenantId') tenantId: string) {
    return this.callflowService.listMediaFiles(req.user!, tenantId);
  }

  @Post('media-files')
  @RequirePermissions(Permission.TENANT_MEDIA_MANAGE)
  createMediaFile(@Req() req: RequestWithUser, @Param('tenantId') tenantId: string, @Body() body: unknown) {
    return this.callflowService.createMediaFile(req.user!, tenantId, CreateMediaFileSchema.parse(body));
  }

  @Get('media-files/:id')
  @RequirePermissions(Permission.TENANT_MEDIA_MANAGE)
  getMediaFile(@Req() req: RequestWithUser, @Param('tenantId') tenantId: string, @Param('id') id: string) {
    return this.callflowService.getMediaFile(req.user!, tenantId, id);
  }

  @Patch('media-files/:id')
  @RequirePermissions(Permission.TENANT_MEDIA_MANAGE)
  patchMediaFile(
    @Req() req: RequestWithUser,
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.callflowService.patchMediaFile(req.user!, tenantId, id, UpdateMediaFileSchema.parse(body));
  }

  @Delete('media-files/:id')
  @RequirePermissions(Permission.TENANT_MEDIA_MANAGE)
  deleteMediaFile(@Req() req: RequestWithUser, @Param('tenantId') tenantId: string, @Param('id') id: string) {
    return this.callflowService.deleteMediaFile(req.user!, tenantId, id);
  }

  @Get('moh-classes')
  @RequirePermissions(Permission.TENANT_MEDIA_MANAGE)
  listMohClasses(@Req() req: RequestWithUser, @Param('tenantId') tenantId: string) {
    return this.callflowService.listMohClasses(req.user!, tenantId);
  }

  @Post('moh-classes')
  @RequirePermissions(Permission.TENANT_MEDIA_MANAGE)
  createMohClass(@Req() req: RequestWithUser, @Param('tenantId') tenantId: string, @Body() body: unknown) {
    return this.callflowService.createMohClass(req.user!, tenantId, CreateMohClassSchema.parse(body));
  }

  @Get('moh-classes/:id')
  @RequirePermissions(Permission.TENANT_MEDIA_MANAGE)
  getMohClass(@Req() req: RequestWithUser, @Param('tenantId') tenantId: string, @Param('id') id: string) {
    return this.callflowService.getMohClass(req.user!, tenantId, id);
  }

  @Patch('moh-classes/:id')
  @RequirePermissions(Permission.TENANT_MEDIA_MANAGE)
  patchMohClass(
    @Req() req: RequestWithUser,
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.callflowService.patchMohClass(req.user!, tenantId, id, UpdateMohClassSchema.parse(body));
  }

  @Delete('moh-classes/:id')
  @RequirePermissions(Permission.TENANT_MEDIA_MANAGE)
  deleteMohClass(@Req() req: RequestWithUser, @Param('tenantId') tenantId: string, @Param('id') id: string) {
    return this.callflowService.deleteMohClass(req.user!, tenantId, id);
  }

  @Get('voicemails')
  @RequireAnyPermission(Permission.TENANT_VOICEMAIL_MANAGE, Permission.AGENT_VOICEMAIL_READ)
  listVoicemails(
    @Req() req: RequestWithUser,
    @Param('tenantId') tenantId: string,
    @Query() query: unknown,
  ) {
    return this.callflowService.listVoicemails(
      req.user!,
      tenantId,
      ListVoicemailsQuerySchema.parse(query),
    );
  }

  @Patch('voicemails/:id/read')
  @RequireAnyPermission(Permission.TENANT_VOICEMAIL_MANAGE, Permission.AGENT_VOICEMAIL_READ)
  markVoicemailRead(
    @Req() req: RequestWithUser,
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.callflowService.markVoicemailRead(
      req.user!,
      tenantId,
      id,
      MarkVoicemailReadSchema.parse(body),
    );
  }

  @Delete('voicemails/:id')
  @RequireAnyPermission(Permission.TENANT_VOICEMAIL_MANAGE, Permission.AGENT_VOICEMAIL_READ)
  deleteVoicemail(@Req() req: RequestWithUser, @Param('tenantId') tenantId: string, @Param('id') id: string) {
    return this.callflowService.deleteVoicemail(req.user!, tenantId, id);
  }

  @Get('campaigns')
  @RequirePermissions(Permission.TENANT_CAMPAIGN_MANAGE)
  listCampaigns(@Req() req: RequestWithUser, @Param('tenantId') tenantId: string) {
    return this.callflowService.listCampaigns(req.user!, tenantId);
  }

  @Post('campaigns')
  @RequirePermissions(Permission.TENANT_CAMPAIGN_MANAGE)
  createCampaign(@Req() req: RequestWithUser, @Param('tenantId') tenantId: string, @Body() body: unknown) {
    return this.callflowService.createCampaign(req.user!, tenantId, CreateCampaignSchema.parse(body));
  }

  @Get('campaigns/:id')
  @RequirePermissions(Permission.TENANT_CAMPAIGN_MANAGE)
  getCampaign(@Req() req: RequestWithUser, @Param('tenantId') tenantId: string, @Param('id') id: string) {
    return this.callflowService.getCampaign(req.user!, tenantId, id);
  }

  @Patch('campaigns/:id')
  @RequirePermissions(Permission.TENANT_CAMPAIGN_MANAGE)
  patchCampaign(
    @Req() req: RequestWithUser,
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.callflowService.patchCampaign(req.user!, tenantId, id, UpdateCampaignSchema.parse(body));
  }

  @Delete('campaigns/:id')
  @RequirePermissions(Permission.TENANT_CAMPAIGN_MANAGE)
  deleteCampaign(@Req() req: RequestWithUser, @Param('tenantId') tenantId: string, @Param('id') id: string) {
    return this.callflowService.deleteCampaign(req.user!, tenantId, id);
  }

  @Post('campaigns/:id/start')
  @RequirePermissions(Permission.TENANT_CAMPAIGN_MANAGE)
  startCampaign(@Req() req: RequestWithUser, @Param('tenantId') tenantId: string, @Param('id') id: string) {
    return this.callflowService.startCampaign(req.user!, tenantId, id);
  }

  @Post('campaigns/:id/pause')
  @RequirePermissions(Permission.TENANT_CAMPAIGN_MANAGE)
  pauseCampaign(@Req() req: RequestWithUser, @Param('tenantId') tenantId: string, @Param('id') id: string) {
    return this.callflowService.pauseCampaign(req.user!, tenantId, id);
  }

  @Post('campaigns/:id/stop')
  @RequirePermissions(Permission.TENANT_CAMPAIGN_MANAGE)
  stopCampaign(@Req() req: RequestWithUser, @Param('tenantId') tenantId: string, @Param('id') id: string) {
    return this.callflowService.stopCampaign(req.user!, tenantId, id);
  }

  @Get('telephony-cron-jobs')
  @RequirePermissions(Permission.TENANT_CALLFLOW_MANAGE)
  listTelephonyCronJobs(@Req() req: RequestWithUser, @Param('tenantId') tenantId: string) {
    return this.callflowService.listTelephonyCronJobs(req.user!, tenantId);
  }

  @Post('telephony-cron-jobs')
  @RequirePermissions(Permission.TENANT_CALLFLOW_MANAGE)
  createTelephonyCronJob(
    @Req() req: RequestWithUser,
    @Param('tenantId') tenantId: string,
    @Body() body: unknown,
  ) {
    return this.callflowService.createTelephonyCronJob(
      req.user!,
      tenantId,
      CreateTelephonyCronJobSchema.parse(body),
    );
  }

  @Get('telephony-cron-jobs/:id')
  @RequirePermissions(Permission.TENANT_CALLFLOW_MANAGE)
  getTelephonyCronJob(@Req() req: RequestWithUser, @Param('tenantId') tenantId: string, @Param('id') id: string) {
    return this.callflowService.getTelephonyCronJob(req.user!, tenantId, id);
  }

  @Patch('telephony-cron-jobs/:id')
  @RequirePermissions(Permission.TENANT_CALLFLOW_MANAGE)
  patchTelephonyCronJob(
    @Req() req: RequestWithUser,
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.callflowService.patchTelephonyCronJob(
      req.user!,
      tenantId,
      id,
      UpdateTelephonyCronJobSchema.parse(body),
    );
  }

  @Delete('telephony-cron-jobs/:id')
  @RequirePermissions(Permission.TENANT_CALLFLOW_MANAGE)
  deleteTelephonyCronJob(
    @Req() req: RequestWithUser,
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
  ) {
    return this.callflowService.deleteTelephonyCronJob(req.user!, tenantId, id);
  }

  @Get('feature-codes')
  @RequirePermissions(Permission.TENANT_CALLFLOW_MANAGE)
  listFeatureCodes(@Req() req: RequestWithUser, @Param('tenantId') tenantId: string) {
    return this.callflowService.listFeatureCodes(req.user!, tenantId);
  }

  @Post('feature-codes')
  @RequirePermissions(Permission.TENANT_CALLFLOW_MANAGE)
  createFeatureCode(@Req() req: RequestWithUser, @Param('tenantId') tenantId: string, @Body() body: unknown) {
    return this.callflowService.createFeatureCode(req.user!, tenantId, CreateFeatureCodeSchema.parse(body));
  }

  @Get('feature-codes/:id')
  @RequirePermissions(Permission.TENANT_CALLFLOW_MANAGE)
  getFeatureCode(@Req() req: RequestWithUser, @Param('tenantId') tenantId: string, @Param('id') id: string) {
    return this.callflowService.getFeatureCode(req.user!, tenantId, id);
  }

  @Patch('feature-codes/:id')
  @RequirePermissions(Permission.TENANT_CALLFLOW_MANAGE)
  patchFeatureCode(
    @Req() req: RequestWithUser,
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.callflowService.patchFeatureCode(req.user!, tenantId, id, UpdateFeatureCodeSchema.parse(body));
  }

  @Delete('feature-codes/:id')
  @RequirePermissions(Permission.TENANT_CALLFLOW_MANAGE)
  deleteFeatureCode(@Req() req: RequestWithUser, @Param('tenantId') tenantId: string, @Param('id') id: string) {
    return this.callflowService.deleteFeatureCode(req.user!, tenantId, id);
  }

  @Get('blacklist')
  @RequirePermissions(Permission.TENANT_CALLFLOW_MANAGE)
  listBlacklist(@Req() req: RequestWithUser, @Param('tenantId') tenantId: string) {
    return this.callflowService.listBlacklist(req.user!, tenantId);
  }

  @Post('blacklist')
  @RequirePermissions(Permission.TENANT_CALLFLOW_MANAGE)
  createBlacklistEntry(@Req() req: RequestWithUser, @Param('tenantId') tenantId: string, @Body() body: unknown) {
    return this.callflowService.createBlacklistEntry(req.user!, tenantId, CreateBlacklistEntrySchema.parse(body));
  }

  @Get('blacklist/:id')
  @RequirePermissions(Permission.TENANT_CALLFLOW_MANAGE)
  getBlacklistEntry(@Req() req: RequestWithUser, @Param('tenantId') tenantId: string, @Param('id') id: string) {
    return this.callflowService.getBlacklistEntry(req.user!, tenantId, id);
  }

  @Patch('blacklist/:id')
  @RequirePermissions(Permission.TENANT_CALLFLOW_MANAGE)
  patchBlacklistEntry(
    @Req() req: RequestWithUser,
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.callflowService.patchBlacklistEntry(req.user!, tenantId, id, UpdateBlacklistEntrySchema.parse(body));
  }

  @Delete('blacklist/:id')
  @RequirePermissions(Permission.TENANT_CALLFLOW_MANAGE)
  deleteBlacklistEntry(@Req() req: RequestWithUser, @Param('tenantId') tenantId: string, @Param('id') id: string) {
    return this.callflowService.deleteBlacklistEntry(req.user!, tenantId, id);
  }

  @Get('short-numbers')
  @RequirePermissions(Permission.TENANT_CALLFLOW_MANAGE)
  listShortNumbers(@Req() req: RequestWithUser, @Param('tenantId') tenantId: string) {
    return this.callflowService.listShortNumbers(req.user!, tenantId);
  }

  @Post('short-numbers')
  @RequirePermissions(Permission.TENANT_CALLFLOW_MANAGE)
  createShortNumber(@Req() req: RequestWithUser, @Param('tenantId') tenantId: string, @Body() body: unknown) {
    return this.callflowService.createShortNumber(req.user!, tenantId, CreateShortNumberSchema.parse(body));
  }

  @Get('short-numbers/:id')
  @RequirePermissions(Permission.TENANT_CALLFLOW_MANAGE)
  getShortNumber(@Req() req: RequestWithUser, @Param('tenantId') tenantId: string, @Param('id') id: string) {
    return this.callflowService.getShortNumber(req.user!, tenantId, id);
  }

  @Patch('short-numbers/:id')
  @RequirePermissions(Permission.TENANT_CALLFLOW_MANAGE)
  patchShortNumber(
    @Req() req: RequestWithUser,
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.callflowService.patchShortNumber(req.user!, tenantId, id, UpdateShortNumberSchema.parse(body));
  }

  @Delete('short-numbers/:id')
  @RequirePermissions(Permission.TENANT_CALLFLOW_MANAGE)
  deleteShortNumber(@Req() req: RequestWithUser, @Param('tenantId') tenantId: string, @Param('id') id: string) {
    return this.callflowService.deleteShortNumber(req.user!, tenantId, id);
  }

  @Get('custom-destinations')
  @RequirePermissions(Permission.TENANT_CALLFLOW_MANAGE)
  listCustomDestinations(@Req() req: RequestWithUser, @Param('tenantId') tenantId: string) {
    return this.callflowService.listCustomDestinations(req.user!, tenantId);
  }

  @Post('custom-destinations')
  @RequirePermissions(Permission.TENANT_CALLFLOW_MANAGE)
  createCustomDestination(@Req() req: RequestWithUser, @Param('tenantId') tenantId: string, @Body() body: unknown) {
    return this.callflowService.createCustomDestination(req.user!, tenantId, CreateCustomDestinationSchema.parse(body));
  }

  @Get('custom-destinations/:id')
  @RequirePermissions(Permission.TENANT_CALLFLOW_MANAGE)
  getCustomDestination(@Req() req: RequestWithUser, @Param('tenantId') tenantId: string, @Param('id') id: string) {
    return this.callflowService.getCustomDestination(req.user!, tenantId, id);
  }

  @Patch('custom-destinations/:id')
  @RequirePermissions(Permission.TENANT_CALLFLOW_MANAGE)
  patchCustomDestination(
    @Req() req: RequestWithUser,
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.callflowService.patchCustomDestination(
      req.user!,
      tenantId,
      id,
      UpdateCustomDestinationSchema.parse(body),
    );
  }

  @Delete('custom-destinations/:id')
  @RequirePermissions(Permission.TENANT_CALLFLOW_MANAGE)
  deleteCustomDestination(@Req() req: RequestWithUser, @Param('tenantId') tenantId: string, @Param('id') id: string) {
    return this.callflowService.deleteCustomDestination(req.user!, tenantId, id);
  }

  @Get('conferences')
  @RequirePermissions(Permission.TENANT_CALLFLOW_MANAGE)
  listConferences(@Req() req: RequestWithUser, @Param('tenantId') tenantId: string) {
    return this.callflowService.listConferences(req.user!, tenantId);
  }

  @Post('conferences')
  @RequirePermissions(Permission.TENANT_CALLFLOW_MANAGE)
  createConference(@Req() req: RequestWithUser, @Param('tenantId') tenantId: string, @Body() body: unknown) {
    return this.callflowService.createConference(req.user!, tenantId, CreateConferenceSchema.parse(body));
  }

  @Get('conferences/:id')
  @RequirePermissions(Permission.TENANT_CALLFLOW_MANAGE)
  getConference(@Req() req: RequestWithUser, @Param('tenantId') tenantId: string, @Param('id') id: string) {
    return this.callflowService.getConference(req.user!, tenantId, id);
  }

  @Patch('conferences/:id')
  @RequirePermissions(Permission.TENANT_CALLFLOW_MANAGE)
  patchConference(
    @Req() req: RequestWithUser,
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.callflowService.patchConference(req.user!, tenantId, id, UpdateConferenceSchema.parse(body));
  }

  @Delete('conferences/:id')
  @RequirePermissions(Permission.TENANT_CALLFLOW_MANAGE)
  deleteConference(@Req() req: RequestWithUser, @Param('tenantId') tenantId: string, @Param('id') id: string) {
    return this.callflowService.deleteConference(req.user!, tenantId, id);
  }

  @Get('paging-groups')
  @RequirePermissions(Permission.TENANT_CALLFLOW_MANAGE)
  listPagingGroups(@Req() req: RequestWithUser, @Param('tenantId') tenantId: string) {
    return this.callflowService.listPagingGroups(req.user!, tenantId);
  }

  @Post('paging-groups')
  @RequirePermissions(Permission.TENANT_CALLFLOW_MANAGE)
  createPagingGroup(@Req() req: RequestWithUser, @Param('tenantId') tenantId: string, @Body() body: unknown) {
    return this.callflowService.createPagingGroup(req.user!, tenantId, CreatePagingGroupSchema.parse(body));
  }

  @Get('paging-groups/:id')
  @RequirePermissions(Permission.TENANT_CALLFLOW_MANAGE)
  getPagingGroup(@Req() req: RequestWithUser, @Param('tenantId') tenantId: string, @Param('id') id: string) {
    return this.callflowService.getPagingGroup(req.user!, tenantId, id);
  }

  @Patch('paging-groups/:id')
  @RequirePermissions(Permission.TENANT_CALLFLOW_MANAGE)
  patchPagingGroup(
    @Req() req: RequestWithUser,
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.callflowService.patchPagingGroup(req.user!, tenantId, id, UpdatePagingGroupSchema.parse(body));
  }

  @Delete('paging-groups/:id')
  @RequirePermissions(Permission.TENANT_CALLFLOW_MANAGE)
  deletePagingGroup(@Req() req: RequestWithUser, @Param('tenantId') tenantId: string, @Param('id') id: string) {
    return this.callflowService.deletePagingGroup(req.user!, tenantId, id);
  }

  @Get('phonebooks')
  @RequirePermissions(Permission.TENANT_PHONEBOOK_MANAGE)
  listPhonebookEntries(
    @Req() req: RequestWithUser,
    @Param('tenantId') tenantId: string,
    @Query() query: unknown,
  ) {
    const parsed = ListPhonebookEntriesQuerySchema.parse(query);
    return this.callflowService.listPhonebookEntries(req.user!, tenantId, parsed.bookName);
  }

  @Post('phonebooks')
  @RequirePermissions(Permission.TENANT_PHONEBOOK_MANAGE)
  createPhonebookEntry(@Req() req: RequestWithUser, @Param('tenantId') tenantId: string, @Body() body: unknown) {
    return this.callflowService.createPhonebookEntry(req.user!, tenantId, CreatePhonebookEntrySchema.parse(body));
  }

  @Get('phonebooks/:id')
  @RequirePermissions(Permission.TENANT_PHONEBOOK_MANAGE)
  getPhonebookEntry(@Req() req: RequestWithUser, @Param('tenantId') tenantId: string, @Param('id') id: string) {
    return this.callflowService.getPhonebookEntry(req.user!, tenantId, id);
  }

  @Patch('phonebooks/:id')
  @RequirePermissions(Permission.TENANT_PHONEBOOK_MANAGE)
  patchPhonebookEntry(
    @Req() req: RequestWithUser,
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.callflowService.patchPhonebookEntry(req.user!, tenantId, id, UpdatePhonebookEntrySchema.parse(body));
  }

  @Delete('phonebooks/:id')
  @RequirePermissions(Permission.TENANT_PHONEBOOK_MANAGE)
  deletePhonebookEntry(@Req() req: RequestWithUser, @Param('tenantId') tenantId: string, @Param('id') id: string) {
    return this.callflowService.deletePhonebookEntry(req.user!, tenantId, id);
  }

  @Get('dnc-lists')
  @RequirePermissions(Permission.TENANT_CAMPAIGN_MANAGE)
  listDncLists(@Req() req: RequestWithUser, @Param('tenantId') tenantId: string) {
    return this.callflowService.listDncLists(req.user!, tenantId);
  }

  @Post('dnc-lists')
  @RequirePermissions(Permission.TENANT_CAMPAIGN_MANAGE)
  createDncList(@Req() req: RequestWithUser, @Param('tenantId') tenantId: string, @Body() body: unknown) {
    return this.callflowService.createDncList(req.user!, tenantId, CreateDncListSchema.parse(body));
  }

  @Get('dnc-lists/:id')
  @RequirePermissions(Permission.TENANT_CAMPAIGN_MANAGE)
  getDncList(@Req() req: RequestWithUser, @Param('tenantId') tenantId: string, @Param('id') id: string) {
    return this.callflowService.getDncList(req.user!, tenantId, id);
  }

  @Patch('dnc-lists/:id')
  @RequirePermissions(Permission.TENANT_CAMPAIGN_MANAGE)
  patchDncList(
    @Req() req: RequestWithUser,
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.callflowService.patchDncList(req.user!, tenantId, id, UpdateDncListSchema.parse(body));
  }

  @Delete('dnc-lists/:id')
  @RequirePermissions(Permission.TENANT_CAMPAIGN_MANAGE)
  deleteDncList(@Req() req: RequestWithUser, @Param('tenantId') tenantId: string, @Param('id') id: string) {
    return this.callflowService.deleteDncList(req.user!, tenantId, id);
  }

  @Post('dnc-lists/:id/numbers')
  @RequirePermissions(Permission.TENANT_CAMPAIGN_MANAGE)
  addDncListNumber(
    @Req() req: RequestWithUser,
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.callflowService.addDncListNumber(req.user!, tenantId, id, AddDncListNumberSchema.parse(body));
  }

  @Delete('dnc-lists/:id/numbers/:number')
  @RequirePermissions(Permission.TENANT_CAMPAIGN_MANAGE)
  removeDncListNumber(
    @Req() req: RequestWithUser,
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Param('number') number: string,
  ) {
    return this.callflowService.removeDncListNumber(req.user!, tenantId, id, decodeURIComponent(number));
  }

  @Get('locales')
  @RequirePermissions(Permission.TENANT_CALLFLOW_MANAGE)
  getLocales(@Req() req: RequestWithUser, @Param('tenantId') tenantId: string) {
    return this.callflowService.getTenantLocales(req.user!, tenantId);
  }

  @Patch('locales')
  @RequirePermissions(Permission.TENANT_UPDATE)
  patchLocales(@Req() req: RequestWithUser, @Param('tenantId') tenantId: string, @Body() body: unknown) {
    return this.callflowService.patchTenantLocales(req.user!, tenantId, UpdateTenantLocalesSchema.parse(body));
  }
}
