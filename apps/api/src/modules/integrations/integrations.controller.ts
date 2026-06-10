import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  CreateIntegrationAssignmentSchema,
  CreateIntegrationSchema,
  Permission,
  ReplaceIntegrationCredentialSchema,
  UpdateIntegrationSchema,
} from '@pbx/contracts';
import type { RequestWithUser } from '../../common/guards/auth.guard.js';
import { RequireAnyPermission, RequirePermissions } from '../../common/guards/auth.guard.js';
import { IntegrationsService } from './integrations.service.js';
import { CredentialResolverService } from './credential-resolver.service.js';

@Controller('platform/integrations')
export class IntegrationsController {
  constructor(
    @Inject(IntegrationsService) private readonly service: IntegrationsService,
    @Inject(CredentialResolverService) private readonly resolver: CredentialResolverService,
  ) {}

  @Get()
  @RequireAnyPermission(Permission.PLATFORM_INTEGRATIONS_READ, Permission.PLATFORM_INTEGRATIONS_MANAGE)
  list(@Req() req: RequestWithUser, @Query('integrationType') integrationType?: string) {
    return this.service.list(req.user!, integrationType ? { integrationType } : undefined);
  }

  @Post()
  @RequirePermissions(Permission.PLATFORM_INTEGRATIONS_MANAGE)
  create(@Req() req: RequestWithUser, @Body() body: unknown) {
    return this.service.create(req.user!, CreateIntegrationSchema.parse(body));
  }

  @Get('audit')
  @RequirePermissions(Permission.PLATFORM_INTEGRATIONS_AUDIT)
  auditAll(@Req() req: RequestWithUser) {
    return this.service.auditAll(req.user!);
  }

  @Get('credential-status')
  @RequirePermissions(Permission.PLATFORM_INTEGRATIONS_READ)
  async credentialStatus(
    @Query('integrationType') integrationType: string,
    @Query('provider') provider: string,
    @Query('tenantId') tenantId?: string,
    @Query('environment') environment?: string,
  ) {
    const status = await this.resolver.resolveStatus({
      integrationType: integrationType as 'ai' | 'sip_carrier' | 'stripe',
      provider,
      ...(tenantId ? { tenantId } : {}),
      ...(environment ? { environment } : {}),
    });
    return status;
  }

  @Get(':id')
  @RequireAnyPermission(Permission.PLATFORM_INTEGRATIONS_READ, Permission.PLATFORM_INTEGRATIONS_MANAGE)
  get(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.service.get(req.user!, id);
  }

  @Patch(':id')
  @RequirePermissions(Permission.PLATFORM_INTEGRATIONS_MANAGE)
  update(@Req() req: RequestWithUser, @Param('id') id: string, @Body() body: unknown) {
    return this.service.update(req.user!, id, UpdateIntegrationSchema.parse(body));
  }

  @Post(':id/replace-credential')
  @RequirePermissions(Permission.PLATFORM_INTEGRATIONS_MANAGE)
  replaceCredential(@Req() req: RequestWithUser, @Param('id') id: string, @Body() body: unknown) {
    return this.service.replaceCredential(req.user!, id, ReplaceIntegrationCredentialSchema.parse(body));
  }

  @Post(':id/rotate')
  @RequirePermissions(Permission.PLATFORM_INTEGRATIONS_MANAGE)
  rotate(@Req() req: RequestWithUser, @Param('id') id: string, @Body() body: unknown) {
    const parsed = ReplaceIntegrationCredentialSchema.parse(body);
    return this.service.rotate(req.user!, id, parsed.credentials);
  }

  @Post(':id/enable')
  @RequirePermissions(Permission.PLATFORM_INTEGRATIONS_MANAGE)
  enable(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.service.enable(req.user!, id);
  }

  @Post(':id/disable')
  @RequirePermissions(Permission.PLATFORM_INTEGRATIONS_MANAGE)
  disable(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.service.disable(req.user!, id);
  }

  @Post(':id/validate')
  @RequirePermissions(Permission.PLATFORM_INTEGRATIONS_VALIDATE)
  validate(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.service.validateConfiguration(req.user!, id);
  }

  @Post(':id/validate-configuration')
  @RequirePermissions(Permission.PLATFORM_INTEGRATIONS_VALIDATE)
  validateConfiguration(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.service.validateConfiguration(req.user!, id);
  }

  @Post(':id/validate-network')
  @RequirePermissions(Permission.PLATFORM_INTEGRATIONS_VALIDATE)
  validateNetwork(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.service.validateNetwork(req.user!, id);
  }

  @Get(':id/audit')
  @RequirePermissions(Permission.PLATFORM_INTEGRATIONS_AUDIT)
  audit(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.service.auditHistory(req.user!, id);
  }

  @Get(':id/assignments')
  @RequirePermissions(Permission.PLATFORM_INTEGRATIONS_ASSIGN)
  assignments(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.service.listAssignments(req.user!, id);
  }

  @Post(':id/assignments')
  @RequirePermissions(Permission.PLATFORM_INTEGRATIONS_ASSIGN)
  assign(@Req() req: RequestWithUser, @Param('id') id: string, @Body() body: unknown) {
    return this.service.assign(req.user!, id, CreateIntegrationAssignmentSchema.parse(body));
  }

  @Delete(':id/assignments/:assignmentId')
  @RequirePermissions(Permission.PLATFORM_INTEGRATIONS_ASSIGN)
  removeAssignment(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Param('assignmentId') assignmentId: string,
  ) {
    return this.service.removeAssignment(req.user!, id, assignmentId);
  }
}
