import { Body, Controller, Get, Inject, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { InviteTenantUserSchema, Permission, UpdateMembershipSchema } from '@pbx/contracts';
import type { RequestWithUser } from '../../common/guards/auth.guard.js';
import {
  RequireAnyPermission,
  RequirePermissions,
  Public,
} from '../../common/guards/auth.guard.js';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { MembershipsService } from './memberships.service.js';

@Controller('tenants/:tenantId')
@UseGuards(TenantGuard)
export class MembershipsController {
  constructor(@Inject(MembershipsService) private readonly membershipsService: MembershipsService) {}

  @Get('users')
  @RequireAnyPermission(Permission.TENANT_USER_MANAGE, Permission.TENANT_READ)
  async listUsers(@Req() req: RequestWithUser, @Param('tenantId') tenantId: string) {
    return this.membershipsService.listTenantUsers(req.user!, tenantId);
  }

  @Get('invitations')
  @RequirePermissions(Permission.TENANT_USER_MANAGE)
  async listInvitations(@Req() req: RequestWithUser, @Param('tenantId') tenantId: string) {
    return this.membershipsService.listInvitations(req.user!, tenantId);
  }

  @Post('invitations')
  @RequirePermissions(Permission.TENANT_USER_MANAGE)
  async invite(@Req() req: RequestWithUser, @Param('tenantId') tenantId: string, @Body() body: unknown) {
    const parsed = InviteTenantUserSchema.parse(body);
    return this.membershipsService.inviteUser(req.user!, tenantId, parsed);
  }

  @Post('invitations/:invitationId/resend')
  @RequirePermissions(Permission.TENANT_USER_MANAGE)
  async resend(
    @Req() req: RequestWithUser,
    @Param('tenantId') tenantId: string,
    @Param('invitationId') invitationId: string,
  ) {
    return this.membershipsService.resendInvitation(req.user!, tenantId, invitationId);
  }

  @Post('invitations/:invitationId/revoke')
  @RequirePermissions(Permission.TENANT_USER_MANAGE)
  async revoke(
    @Req() req: RequestWithUser,
    @Param('tenantId') tenantId: string,
    @Param('invitationId') invitationId: string,
  ) {
    return this.membershipsService.revokeInvitation(req.user!, tenantId, invitationId);
  }

  @Patch('memberships/:membershipId')
  @RequirePermissions(Permission.TENANT_USER_MANAGE)
  async updateMembership(
    @Req() req: RequestWithUser,
    @Param('tenantId') tenantId: string,
    @Param('membershipId') membershipId: string,
    @Body() body: unknown,
  ) {
    const parsed = UpdateMembershipSchema.parse(body);
    return this.membershipsService.updateMembership(req.user!, tenantId, membershipId, parsed);
  }
}

@Controller('invitations')
export class InvitationsPublicController {
  constructor(@Inject(MembershipsService) private readonly membershipsService: MembershipsService) {}

  @Post('accept')
  @Public()
  async accept(@Body() body: unknown) {
    return this.membershipsService.acceptInvitation(body as Parameters<MembershipsService['acceptInvitation']>[0]);
  }
}
