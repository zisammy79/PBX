import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { tenantAccessDenied } from '@pbx/contracts';
import { eq } from 'drizzle-orm';
import { tenants } from '@pbx/database';
import { Inject } from '@nestjs/common';
import { DATABASE } from '../tokens.js';
import type { Database } from '@pbx/database';
import {
  RequestWithUser,
  resolveActiveTenantId,
} from './auth.guard.js';

/** Ensures tenant context is derived from auth — never blindly trusted from client. */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(@Inject(DATABASE) private readonly database: ReturnType<typeof import('@pbx/database').createDatabase>) {}

  get db(): Database {
    return this.database.db;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;
    if (!user) return false;

    const headerTenantId = request.headers['x-tenant-id'] as string | undefined;
    const paramTenantId = (request.params as { tenantId?: string })?.tenantId;

    if (user.authMethod === 'api_key') {
      const keyTenantId = user.apiKeyTenantId!;
      if (headerTenantId && headerTenantId !== keyTenantId) {
        throw tenantAccessDenied();
      }
      if (paramTenantId && paramTenantId !== keyTenantId) {
        throw tenantAccessDenied();
      }
      request.activeTenantId = keyTenantId;
      return this.assertTenantActive(keyTenantId);
    }

    const tenantId = resolveActiveTenantId(user, headerTenantId ?? paramTenantId);

    if (!tenantId) {
      throw new ForbiddenException('Tenant context required');
    }

    const isPlatformAdmin = user.platformRoles.includes('platform_super_admin');
    const isSupport = !!user.supportSession?.tenantId;
    const isMember = user.tenantMemberships.some((m) => m.tenantId === tenantId);

    if (!isMember && !isPlatformAdmin && !isSupport) {
      throw tenantAccessDenied();
    }

    return this.assertTenantActive(tenantId, request);
  }

  private async assertTenantActive(tenantId: string, request?: RequestWithUser): Promise<boolean> {
    const [tenant] = await this.db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    if (!tenant || tenant.status === 'closed' || tenant.status === 'archived') {
      throw tenantAccessDenied();
    }

    const isPlatformAdmin = request?.user?.platformRoles.includes('platform_super_admin') ?? false;

    if (tenant.status === 'suspended' && !isPlatformAdmin) {
      throw new ForbiddenException('Tenant is suspended');
    }

    if (request) {
      request.activeTenantId = tenantId;
      (request as RequestWithUser & { tenantSlug?: string }).tenantSlug = tenant.slug;
    }
    return true;
  }
}
