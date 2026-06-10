import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  hasPermission,
  hasAnyPermission,
  resolvePermissionsForRoles,
  resolveEffectivePermissions,
  resolvePermissionsForApiScopes,
  type Permission,
  type PlatformRole,
  type TenantRole,
} from '@pbx/contracts';
import { isApiKeyToken } from '@pbx/shared';
import type { FastifyRequest } from 'fastify';
import { AuthService } from '../../modules/auth/auth.service.js';
import type { AuthenticatedUser } from '../../modules/auth/auth.service.js';
import { ApiKeyAuthService } from '../../modules/api-applications/api-key-auth.service.js';

export type { AuthenticatedUser };

export const PERMISSIONS_KEY = 'permissions';
export const PERMISSIONS_ANY_KEY = 'permissionsAny';
export const IS_PUBLIC_KEY = 'isPublic';

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
export const RequireAnyPermission = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_ANY_KEY, permissions);

export interface RequestWithUser extends FastifyRequest {
  user?: AuthenticatedUser;
  activeTenantId?: string;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(ApiKeyAuthService) private readonly apiKeyAuth: ApiKeyAuthService,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const token = authHeader.slice(7);
    if (isApiKeyToken(token)) {
      const user = await this.apiKeyAuth.authenticate(token);
      request.user = user;
      if (user.apiKeyTenantId) {
        request.activeTenantId = user.apiKeyTenantId;
      }
    } else {
      request.user = await this.authService.verifyAccessToken(token);
    }
    return true;
  }
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredAll = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const requiredAny = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_ANY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredAll?.length && !requiredAny?.length) return true;

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;
    if (!user) return false;

    const granted = this.resolveGrantedPermissions(request, user);

    if (requiredAll?.length && !hasPermission(granted, requiredAll)) {
      return false;
    }
    if (requiredAny?.length && !hasAnyPermission(granted, requiredAny)) {
      return false;
    }
    return true;
  }

  private resolveGrantedPermissions(request: RequestWithUser, user: AuthenticatedUser): Permission[] {
    if (user.authMethod === 'api_key' && user.apiKeyScopes) {
      return resolvePermissionsForApiScopes(user.apiKeyScopes);
    }
    const tenantRoles = this.getActiveTenantRoles(request, user);
    const tenantId =
      request.activeTenantId ??
      user.supportSession?.tenantId ??
      resolveActiveTenantId(
        user,
        (request.headers['x-tenant-id'] as string | undefined) ??
          (request.params as { tenantId?: string })?.tenantId,
      );
    return resolveEffectivePermissions(user.platformRoles, tenantRoles, tenantId);
  }

  private getActiveTenantRoles(
    request: RequestWithUser,
    user: AuthenticatedUser,
  ): TenantRole[] {
    const tenantId =
      request.activeTenantId ??
      user.supportSession?.tenantId ??
      resolveActiveTenantId(
        user,
        (request.headers['x-tenant-id'] as string | undefined) ??
          (request.params as { tenantId?: string })?.tenantId,
      );
    if (!tenantId) return [];
    const membership = user.tenantMemberships.find(
      (m: { tenantId: string }) => m.tenantId === tenantId,
    );
    return membership?.roles ?? [];
  }
}

export function resolveActiveTenantId(
  user: AuthenticatedUser,
  headerTenantId?: string,
): string | undefined {
  if (user.authMethod === 'api_key' && user.apiKeyTenantId) {
    return user.apiKeyTenantId;
  }
  if (user.supportSession?.tenantId) {
    return user.supportSession.tenantId;
  }
  if (!headerTenantId) return undefined;
  const isMember = user.tenantMemberships.some(
    (m: { tenantId: string }) => m.tenantId === headerTenantId,
  );
  const isPlatformAdmin = user.platformRoles.includes('platform_super_admin');
  if (isMember || isPlatformAdmin) {
    return headerTenantId;
  }
  return undefined;
}
