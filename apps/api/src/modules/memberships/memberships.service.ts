import { Inject, Injectable } from '@nestjs/common';
import {
  AcceptInvitationSchema,
  InviteTenantUserSchema,
  notFound,
  tenantAccessDenied,
  UpdateMembershipSchema,
  validationError,
  type AcceptInvitationRequest,
  type InviteTenantUserRequest,
  type TenantInvitationSummary,
  type TenantUserSummary,
  type UpdateMembershipRequest,
} from '@pbx/contracts';
import { generateSecureToken, hashPassword, sha256Hex } from '@pbx/shared';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import {
  auditEvents,
  extensions,
  tenantInvitations,
  tenantMemberships,
  tenants,
  users,
  withBypassRls,
  withTenantContext,
} from '@pbx/database';
import { CONFIG, DATABASE } from '../../common/tokens.js';
import type { AppConfig } from '../../config.js';
import type { AuthenticatedUser } from '../auth/auth.service.js';
import { TenantLimitsService } from '../tenants/tenant-limits.service.js';

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class MembershipsService {
  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    @Inject(DATABASE) private readonly database: ReturnType<typeof import('@pbx/database').createDatabase>,
    @Inject(TenantLimitsService) private readonly tenantLimitsService: TenantLimitsService,
  ) {}

  async listTenantUsers(actor: AuthenticatedUser, tenantId: string): Promise<TenantUserSummary[]> {
    await this.assertCanManageUsers(actor, tenantId);

    return withTenantContext(this.database.db, tenantId, async (db) => {
      const rows = await db
        .select({
          membership: tenantMemberships,
          user: users,
        })
        .from(tenantMemberships)
        .innerJoin(users, eq(tenantMemberships.userId, users.id))
        .where(eq(tenantMemberships.tenantId, tenantId));

      const extRows = await db
        .select()
        .from(extensions)
        .where(and(eq(extensions.tenantId, tenantId), eq(extensions.status, 'active')));

      const pendingInvites = await db
        .select()
        .from(tenantInvitations)
        .where(and(eq(tenantInvitations.tenantId, tenantId), eq(tenantInvitations.status, 'pending')));

      const inviteByEmail = new Map(pendingInvites.map((i) => [i.email.toLowerCase(), i]));

      return rows.map(({ membership, user }) => {
        const invite = inviteByEmail.get(user.email.toLowerCase());
        const assigned = extRows
          .filter((e) => e.userId === user.id)
          .map((e) => ({
            id: e.id,
            extensionNumber: e.extensionNumber,
            displayName: e.displayName,
          }));

        return {
          membershipId: membership.id,
          userId: user.id,
          email: user.email,
          displayName: user.displayName,
          roles: membership.roles as TenantUserSummary['roles'],
          membershipStatus: membership.status as TenantUserSummary['membershipStatus'],
          invitationStatus: invite
            ? ('pending' as const)
            : membership.status === 'invited'
              ? ('pending' as const)
              : ('none' as const),
          assignedExtensions: assigned,
          lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
          createdAt: membership.createdAt.toISOString(),
        };
      });
    });
  }

  async listInvitations(
    actor: AuthenticatedUser,
    tenantId: string,
  ): Promise<TenantInvitationSummary[]> {
    await this.assertCanManageUsers(actor, tenantId);

    return withTenantContext(this.database.db, tenantId, async (db) => {
      const rows = await db
        .select()
        .from(tenantInvitations)
        .where(eq(tenantInvitations.tenantId, tenantId));

      return rows.map((row) => ({
        id: row.id,
        email: row.email,
        role: row.role as TenantInvitationSummary['role'],
        status: row.status as TenantInvitationSummary['status'],
        deliveryStatus: row.deliveryStatus as TenantInvitationSummary['deliveryStatus'],
        expiresAt: row.expiresAt.toISOString(),
        createdAt: row.createdAt.toISOString(),
      }));
    });
  }

  async inviteUser(
    actor: AuthenticatedUser,
    tenantId: string,
    input: InviteTenantUserRequest,
  ): Promise<{ invitation: TenantInvitationSummary; invitationLink?: string }> {
    await this.assertCanManageUsers(actor, tenantId);
    await this.tenantLimitsService.assertCanInviteUser(tenantId);

    const token = generateSecureToken(32);
    const tokenHash = sha256Hex(token);
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
    const emailConfigured = Boolean(process.env.SMTP_HOST);

    const invitation = await withTenantContext(this.database.db, tenantId, async (db) => {
      const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
      if (!tenant || tenant.status === 'archived') {
        throw validationError({ tenant: 'Tenant not available for invitations' });
      }

      const [existingInvite] = await db
        .select()
        .from(tenantInvitations)
        .where(
          and(
            eq(tenantInvitations.tenantId, tenantId),
            eq(tenantInvitations.email, input.email),
            eq(tenantInvitations.status, 'pending'),
          ),
        )
        .limit(1);

      if (existingInvite) {
        throw validationError({ email: 'Pending invitation already exists' });
      }

      const [row] = await db
        .insert(tenantInvitations)
        .values({
          tenantId,
          email: input.email,
          role: input.role,
          tokenHash,
          expiresAt,
          deliveryStatus: emailConfigured ? 'delivery_pending' : 'provider_not_configured',
          createdBy: actor.id,
        })
        .returning();

      await db.insert(auditEvents).values({
        tenantId,
        actorUserId: actor.id,
        actorType: 'user',
        action: 'invitation.created',
        resourceType: 'tenant_invitation',
        resourceId: row!.id,
        metadata: { email: input.email, role: input.role },
      });

      return row!;
    });

    const summary: TenantInvitationSummary = {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role as TenantInvitationSummary['role'],
      status: invitation.status as TenantInvitationSummary['status'],
      deliveryStatus: invitation.deliveryStatus as TenantInvitationSummary['deliveryStatus'],
      expiresAt: invitation.expiresAt.toISOString(),
      createdAt: invitation.createdAt.toISOString(),
    };

    const baseUrl = this.config.publicWebUrl ?? 'http://127.0.0.1:3000';
    const invitationLink =
      invitation.deliveryStatus === 'provider_not_configured'
        ? `${baseUrl}/accept-invitation?token=${token}`
        : undefined;

    return { invitation: summary, ...(invitationLink ? { invitationLink } : {}) };
  }

  async resendInvitation(actor: AuthenticatedUser, tenantId: string, invitationId: string) {
    await this.assertCanManageUsers(actor, tenantId);

    const token = generateSecureToken(32);
    const tokenHash = sha256Hex(token);
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);

    const updated = await withTenantContext(this.database.db, tenantId, async (db) => {
      const [row] = await db
        .select()
        .from(tenantInvitations)
        .where(and(eq(tenantInvitations.id, invitationId), eq(tenantInvitations.tenantId, tenantId)))
        .limit(1);

      if (!row || row.status !== 'pending') {
        throw notFound('Invitation');
      }

      const [next] = await db
        .update(tenantInvitations)
        .set({ tokenHash, expiresAt, updatedAt: new Date() })
        .where(eq(tenantInvitations.id, invitationId))
        .returning();

      await db.insert(auditEvents).values({
        tenantId,
        actorUserId: actor.id,
        actorType: 'user',
        action: 'invitation.resent',
        resourceType: 'tenant_invitation',
        resourceId: invitationId,
        metadata: { email: row.email },
      });

      return next!;
    });

    const baseUrl = this.config.publicWebUrl ?? 'http://127.0.0.1:3000';
    return {
      invitation: {
        id: updated.id,
        email: updated.email,
        expiresAt: updated.expiresAt.toISOString(),
      },
      ...(updated.deliveryStatus === 'provider_not_configured'
        ? { invitationLink: `${baseUrl}/accept-invitation?token=${token}` }
        : {}),
    };
  }

  async revokeInvitation(actor: AuthenticatedUser, tenantId: string, invitationId: string) {
    await this.assertCanManageUsers(actor, tenantId);

    return withTenantContext(this.database.db, tenantId, async (db) => {
      const [updated] = await db
        .update(tenantInvitations)
        .set({ status: 'revoked', revokedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(tenantInvitations.id, invitationId),
            eq(tenantInvitations.tenantId, tenantId),
            eq(tenantInvitations.status, 'pending'),
          ),
        )
        .returning();

      if (!updated) throw notFound('Invitation');

      await db.insert(auditEvents).values({
        tenantId,
        actorUserId: actor.id,
        actorType: 'user',
        action: 'invitation.revoked',
        resourceType: 'tenant_invitation',
        resourceId: invitationId,
        metadata: { email: updated.email },
      });

      return { revoked: true };
    });
  }

  async acceptInvitation(input: AcceptInvitationRequest) {
    const parsed = AcceptInvitationSchema.parse(input);
    const tokenHash = sha256Hex(parsed.token);

    return withBypassRls(this.database.db, async (db) => {
      const [invite] = await db
        .select()
        .from(tenantInvitations)
        .where(eq(tenantInvitations.tokenHash, tokenHash))
        .limit(1);

      if (!invite || invite.status !== 'pending') {
        throw validationError({ token: 'Invalid or expired invitation' });
      }
      if (invite.expiresAt.getTime() < Date.now()) {
        await db
          .update(tenantInvitations)
          .set({ status: 'expired', updatedAt: new Date() })
          .where(eq(tenantInvitations.id, invite.id));
        throw validationError({ token: 'Invitation expired' });
      }

      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.email, invite.email))
        .limit(1);

      let userId = existingUser?.id;
      if (!userId) {
        if (!parsed.password) {
          throw validationError({ password: 'Password required for new users' });
        }
        const [created] = await db
          .insert(users)
          .values({
            email: invite.email,
            displayName: parsed.displayName ?? invite.email.split('@')[0]!,
            passwordHash: hashPassword(parsed.password),
            status: 'active',
          })
          .returning();
        userId = created!.id;
      }

      const [existingMembership] = await db
        .select()
        .from(tenantMemberships)
        .where(
          and(eq(tenantMemberships.tenantId, invite.tenantId), eq(tenantMemberships.userId, userId!)),
        )
        .limit(1);

      if (!existingMembership) {
        await db.insert(tenantMemberships).values({
          tenantId: invite.tenantId,
          userId: userId!,
          roles: [invite.role],
          status: 'active',
          invitedAt: invite.createdAt,
          acceptedAt: new Date(),
          createdBy: invite.createdBy,
        });
      } else if (existingMembership.status !== 'active') {
        await db
          .update(tenantMemberships)
          .set({
            status: 'active',
            roles: [invite.role],
            acceptedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(tenantMemberships.id, existingMembership.id));
      }

      await db
        .update(tenantInvitations)
        .set({ status: 'accepted', acceptedAt: new Date(), updatedAt: new Date() })
        .where(eq(tenantInvitations.id, invite.id));

      await db.insert(auditEvents).values({
        tenantId: invite.tenantId,
        actorUserId: userId,
        actorType: 'user',
        action: 'invitation.accepted',
        resourceType: 'tenant_invitation',
        resourceId: invite.id,
        metadata: { email: invite.email },
      });

      return { tenantId: invite.tenantId, accepted: true };
    });
  }

  async updateMembership(
    actor: AuthenticatedUser,
    tenantId: string,
    membershipId: string,
    input: UpdateMembershipRequest,
  ) {
    await this.assertCanManageUsers(actor, tenantId);
    const parsed = UpdateMembershipSchema.parse(input);

    return withTenantContext(this.database.db, tenantId, async (db) => {
      const [membership] = await db
        .select()
        .from(tenantMemberships)
        .where(and(eq(tenantMemberships.id, membershipId), eq(tenantMemberships.tenantId, tenantId)))
        .limit(1);

      if (!membership) throw notFound('Membership');

      const patch: Partial<typeof tenantMemberships.$inferInsert> = { updatedAt: new Date() };
      if (parsed.role) patch.roles = [parsed.role];
      if (parsed.status) {
        patch.status = parsed.status;
        if (parsed.status === 'suspended') patch.suspendedAt = new Date();
        if (parsed.status === 'active') patch.suspendedAt = null;
      }

      const [updated] = await db
        .update(tenantMemberships)
        .set(patch)
        .where(eq(tenantMemberships.id, membershipId))
        .returning();

      await db.insert(auditEvents).values({
        tenantId,
        actorUserId: actor.id,
        actorType: 'user',
        action: 'membership.updated',
        resourceType: 'tenant_membership',
        resourceId: membershipId,
        metadata: { role: parsed.role, status: parsed.status },
      });

      return {
        membershipId: updated!.id,
        roles: updated!.roles,
        status: updated!.status,
      };
    });
  }

  private async assertCanManageUsers(actor: AuthenticatedUser, tenantId: string) {
    const isPlatform = actor.platformRoles.includes('platform_super_admin');
    const membership = actor.tenantMemberships.find((m) => m.tenantId === tenantId);
    const canManage =
      isPlatform ||
      (membership?.roles.some((r) => ['tenant_owner', 'tenant_administrator'].includes(r)) ?? false);
    if (!canManage) throw tenantAccessDenied();
  }
}
