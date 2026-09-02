import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  CloudStorageProviderSchema,
  notFound,
  RecordingCloudExportSettingsSchema,
  tenantAccessDenied,
  UpdateRecordingCloudExportSettingsSchema,
  validationError,
  type CloudStorageConnectionSummary,
  type RecordingCloudExportSettings,
  type UpdateRecordingCloudExportSettings,
} from '@pbx/contracts';
import { Permission, hasAnyPermission, resolveEffectivePermissions } from '@pbx/contracts';
import { decryptSecret, encryptSecret } from '@pbx/shared';
import { SignJWT, jwtVerify } from 'jose';
import { and, desc, eq } from 'drizzle-orm';
import {
  integrationAssignments,
  integrationConnections,
  integrationCredentialVersions,
  tenants,
  tenantSettings,
  withBypassRls,
  withTenantContext,
} from '@pbx/database';
import type { AppConfig } from '../../config.js';
import { CONFIG, DATABASE } from '../../common/tokens.js';
import type { AuthenticatedUser } from '../auth/auth.service.js';

const CLOUD_EXPORT_SETTINGS_KEY = 'recordings.cloudExport';
const OAUTH_STATE_TTL_SECONDS = 600;
const TENANT_ISOLATION_PREFIX = 'tenants';

type OAuthState = {
  provider: 'google_drive' | 'microsoft_onedrive';
  scopeType: 'platform' | 'tenant';
  scopeId?: string | undefined;
  actorUserId: string;
  returnPath: string;
  displayName: string;
};

type OAuthTokensResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
};

@Injectable()
export class CloudStorageService {
  private readonly logger = new Logger(CloudStorageService.name);

  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    @Inject(DATABASE) private readonly database: ReturnType<typeof import('@pbx/database').createDatabase>,
  ) {}

  /**
   * OAuth client IDs are public (never secret). Expose a diagnostic fragment —
   * the project number plus a short tail — so a misconfigured/mismatched client
   * (the cause of `redirect_uri_mismatch`) is visible from the status route and
   * logs without ever reading `/opt/pbx/.env` on the host.
   */
  private clientIdFingerprint(clientId?: string): string | null {
    if (!clientId) return null;
    const projectNumber = clientId.split('-')[0] ?? '';
    return `${projectNumber}…${clientId.slice(-10)}`;
  }

  async listPlatformConnections(actor: AuthenticatedUser): Promise<CloudStorageConnectionSummary[]> {
    this.assertPlatformManage(actor);
    return withBypassRls(this.database.db, async (db) => {
      const rows = await db
        .select()
        .from(integrationConnections)
        .where(
          and(
            eq(integrationConnections.integrationType, 'cloud_storage'),
            eq(integrationConnections.scopeType, 'platform'),
          ),
        )
        .orderBy(desc(integrationConnections.updatedAt));
      return rows.map((row) => this.serializeConnection(row, 'platform_owned'));
    });
  }

  getOAuthStatus(): {
    googleDrive: boolean;
    googleDriveClientId: string | null;
    microsoftOneDrive: boolean;
    microsoftOneDriveClientId: string | null;
    redirectUriGoogle: string;
    redirectUriMicrosoft: string;
  } {
    return {
      googleDrive: Boolean(this.config.googleDriveClientId && this.config.googleDriveClientSecret),
      googleDriveClientId: this.clientIdFingerprint(this.config.googleDriveClientId),
      microsoftOneDrive: Boolean(
        this.config.microsoftOneDriveClientId && this.config.microsoftOneDriveClientSecret,
      ),
      microsoftOneDriveClientId: this.clientIdFingerprint(this.config.microsoftOneDriveClientId),
      redirectUriGoogle: this.oauthCallbackUrl('google_drive'),
      redirectUriMicrosoft: this.oauthCallbackUrl('microsoft_onedrive'),
    };
  }

  async listConnectionAssignments(actor: AuthenticatedUser, connectionId: string): Promise<string[]> {
    this.assertPlatformManage(actor);
    return withBypassRls(this.database.db, async (db) => {
      const rows = await db
        .select({ tenantId: integrationAssignments.tenantId })
        .from(integrationAssignments)
        .where(
          and(eq(integrationAssignments.connectionId, connectionId), eq(integrationAssignments.enabled, true)),
        );
      return rows.map((r) => r.tenantId);
    });
  }

  async unassignConnectionFromTenant(actor: AuthenticatedUser, connectionId: string, tenantId: string) {
    this.assertPlatformManage(actor);
    return withBypassRls(this.database.db, async (db) => {
      await db
        .update(integrationAssignments)
        .set({ enabled: false })
        .where(
          and(
            eq(integrationAssignments.connectionId, connectionId),
            eq(integrationAssignments.tenantId, tenantId),
          ),
        );
      return { ok: true };
    });
  }

  async listTenantConnections(actor: AuthenticatedUser, tenantId: string): Promise<CloudStorageConnectionSummary[]> {
    await this.assertTenantManage(actor, tenantId);
    return withBypassRls(this.database.db, async (db) => {
      const tenantOwned = await db
        .select()
        .from(integrationConnections)
        .where(
          and(
            eq(integrationConnections.integrationType, 'cloud_storage'),
            eq(integrationConnections.scopeType, 'tenant'),
            eq(integrationConnections.scopeId, tenantId),
          ),
        )
        .orderBy(desc(integrationConnections.updatedAt));

      const assigned = await db
        .select({ conn: integrationConnections })
        .from(integrationAssignments)
        .innerJoin(integrationConnections, eq(integrationAssignments.connectionId, integrationConnections.id))
        .where(
          and(
            eq(integrationAssignments.tenantId, tenantId),
            eq(integrationAssignments.enabled, true),
            eq(integrationConnections.integrationType, 'cloud_storage'),
            eq(integrationConnections.enabled, true),
          ),
        )
        .orderBy(desc(integrationConnections.updatedAt));

      const seen = new Set<string>();
      const merged = [...tenantOwned, ...assigned.map((r) => r.conn)].filter((row) => {
        if (seen.has(row.id)) return false;
        seen.add(row.id);
        return true;
      });
      return merged.map((row) =>
        this.serializeConnection(
          row,
          row.scopeType === 'tenant' ? 'tenant_owned' : 'platform_assigned',
        ),
      );
    });
  }

  async startOAuth(
    actor: AuthenticatedUser,
    input: {
      provider: 'google_drive' | 'microsoft_onedrive';
      scopeType: 'platform' | 'tenant';
      scopeId?: string;
      displayName: string;
      returnPath?: string;
    },
  ): Promise<{ authorizationUrl: string }> {
    const provider = CloudStorageProviderSchema.parse(input.provider);
    if (input.scopeType === 'platform') {
      this.assertPlatformManage(actor);
    } else {
      if (!input.scopeId) throw validationError({ scopeId: 'required for tenant scope' });
      await this.assertTenantManage(actor, input.scopeId);
    }

    const oauthConfig = this.resolveOAuthConfig(provider);
    if (!oauthConfig) {
      throw validationError({
        oauth: `OAuth is not configured for ${provider}`,
        hint: this.oauthSetupHint(provider),
      });
    }

    const state = await this.signOAuthState({
      provider,
      scopeType: input.scopeType,
      ...(input.scopeId ? { scopeId: input.scopeId } : {}),
      actorUserId: actor.id,
      returnPath: input.returnPath ?? this.defaultReturnPath(input.scopeType, input.scopeId),
      displayName: input.displayName,
    });

    const redirectUri = this.oauthCallbackUrl(provider);
    this.logger.log(
      `OAuth authorize ${provider}: client=${this.clientIdFingerprint(oauthConfig.clientId)} redirect_uri=${redirectUri} — this exact redirect_uri must be registered on that client`,
    );
    const params = new URLSearchParams({
      client_id: oauthConfig.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      state,
      scope: oauthConfig.scope,
      access_type: 'offline',
      prompt: 'consent',
    });

    return { authorizationUrl: `${oauthConfig.authorizeUrl}?${params.toString()}` };
  }

  async completeOAuth(provider: string, code: string, stateToken: string): Promise<{ redirectUrl: string; connectionId: string }> {
    const providerParsed = CloudStorageProviderSchema.parse(provider);
    const state = await this.verifyOAuthState(stateToken);
    if (state.provider !== providerParsed) {
      throw validationError({ state: 'provider mismatch' });
    }

    const oauthConfig = this.resolveOAuthConfig(providerParsed);
    if (!oauthConfig) {
      throw validationError({ oauth: `OAuth is not configured for ${providerParsed}` });
    }

    const redirectUri = this.oauthCallbackUrl(providerParsed);
    const tokenBody = new URLSearchParams({
      client_id: oauthConfig.clientId,
      client_secret: oauthConfig.clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    });

    const tokenRes = await fetch(oauthConfig.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenBody,
    });
    if (!tokenRes.ok) {
      throw validationError({ oauth: `token_exchange_failed:${tokenRes.status}` });
    }
    const tokens = (await tokenRes.json()) as OAuthTokensResponse;
    if (!tokens.refresh_token) {
      throw validationError({ oauth: 'refresh_token_missing_reauthorize_with_consent' });
    }

    const profile = await this.fetchAccountProfile(providerParsed, tokens.access_token);
    const credentials = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      accountEmail: profile.email ?? '',
      accountName: profile.name ?? '',
    };
    const encrypted = encryptSecret(JSON.stringify(credentials), this.config.encryptionMasterKey);

    const connectionId = await withBypassRls(this.database.db, async (db) => {
      const now = new Date();
      const [row] = await db
        .insert(integrationConnections)
        .values({
          integrationType: 'cloud_storage',
          provider: providerParsed,
          scopeType: state.scopeType,
          scopeId: state.scopeType === 'tenant' ? state.scopeId : null,
          environment: 'default',
          displayName: state.displayName,
          enabled: true,
          isDefault: false,
          config: { folderPath: 'PBX Recordings' },
          encryptedPayload: encrypted,
          validationStatus: 'VALID',
          lastValidatedAt: now,
          createdBy: state.actorUserId,
          updatedAt: now,
        })
        .returning();

      await db.insert(integrationCredentialVersions).values({
        connectionId: row!.id,
        version: 1,
        encryptedPayload: encrypted,
        isActive: true,
        createdBy: state.actorUserId,
      });

      if (state.scopeType === 'platform' && state.scopeId) {
        await db
          .insert(integrationAssignments)
          .values({
            connectionId: row!.id,
            tenantId: state.scopeId,
            enabled: true,
          })
          .onConflictDoNothing();
      }

      if (state.scopeType === 'tenant' && state.scopeId) {
        const exportValue = RecordingCloudExportSettingsSchema.parse({
          enabled: true,
          provider: providerParsed,
          connectionId: row!.id,
          folderPath: 'Call Recordings',
          isolationFolder: null,
        });
        await db
          .insert(tenantSettings)
          .values({
            tenantId: state.scopeId,
            key: CLOUD_EXPORT_SETTINGS_KEY,
            value: exportValue,
          })
          .onConflictDoUpdate({
            target: [tenantSettings.tenantId, tenantSettings.key],
            set: { value: exportValue, updatedAt: now },
          });
      }

      return row!.id;
    });

    return {
      redirectUrl: `${this.config.publicWebUrl}${state.returnPath}?connected=1`,
      connectionId,
    };
  }

  async getTenantExportSettings(actor: AuthenticatedUser, tenantId: string): Promise<RecordingCloudExportSettings> {
    await this.assertTenantManage(actor, tenantId);
    const settings = await withTenantContext(this.database.db, tenantId, async (db) =>
      this.readExportSettings(db, tenantId),
    );
    if (settings.enabled && !settings.isolationFolder && settings.connectionId) {
      const connections = await this.listTenantConnections(actor, tenantId);
      const conn = connections.find((c) => c.id === settings.connectionId);
      if (conn?.connectionSource === 'platform_assigned') {
        const slug = await this.getTenantSlug(tenantId);
        return {
          ...settings,
          isolationFolder: this.tenantIsolationFolder(slug),
          folderPath: settings.folderPath ?? slug,
        };
      }
    }
    return settings;
  }

  async updateTenantExportSettings(
    actor: AuthenticatedUser,
    tenantId: string,
    body: unknown,
  ): Promise<RecordingCloudExportSettings> {
    await this.assertTenantManage(actor, tenantId);
    const input = UpdateRecordingCloudExportSettingsSchema.parse(body);

    if (input.enabled) {
      if (!input.provider || !input.connectionId) {
        throw validationError({ connectionId: 'provider and connectionId required when enabled' });
      }
      const connections = await this.listTenantConnections(actor, tenantId);
      const match = connections.find((c) => c.id === input.connectionId && c.provider === input.provider);
      if (!match) {
        throw validationError({ connectionId: 'connection not available for tenant' });
      }

      const isTenantOwned = match.connectionSource === 'tenant_owned';
      const tenantSlug = await this.getTenantSlug(tenantId);
      const isolationFolder = isTenantOwned ? null : this.tenantIsolationFolder(tenantSlug);
      const folderPath =
        input.folderPath?.trim() || (isTenantOwned ? 'Call Recordings' : tenantSlug);

      const value = RecordingCloudExportSettingsSchema.parse({
        enabled: true,
        provider: input.provider,
        connectionId: input.connectionId,
        folderPath,
        isolationFolder,
      });

      return withTenantContext(this.database.db, tenantId, async (db) => {
        await db
          .insert(tenantSettings)
          .values({ tenantId, key: CLOUD_EXPORT_SETTINGS_KEY, value })
          .onConflictDoUpdate({
            target: [tenantSettings.tenantId, tenantSettings.key],
            set: { value, updatedAt: new Date() },
          });
        return this.readExportSettings(db, tenantId);
      });
    }

    const value = RecordingCloudExportSettingsSchema.parse({
      enabled: false,
      provider: null,
      connectionId: null,
      folderPath: null,
      isolationFolder: null,
    });

    return withTenantContext(this.database.db, tenantId, async (db) => {
      await db
        .insert(tenantSettings)
        .values({ tenantId, key: CLOUD_EXPORT_SETTINGS_KEY, value })
        .onConflictDoUpdate({
          target: [tenantSettings.tenantId, tenantSettings.key],
          set: { value, updatedAt: new Date() },
        });
      return this.readExportSettings(db, tenantId);
    });
  }

  async assignConnectionToTenant(actor: AuthenticatedUser, connectionId: string, tenantId: string) {
    this.assertPlatformManage(actor);
    return withBypassRls(this.database.db, async (db) => {
      const [conn] = await db
        .select()
        .from(integrationConnections)
        .where(eq(integrationConnections.id, connectionId))
        .limit(1);
      if (!conn || conn.integrationType !== 'cloud_storage') throw notFound('Cloud storage connection');
      await db
        .insert(integrationAssignments)
        .values({ connectionId, tenantId, enabled: true })
        .onConflictDoUpdate({
          target: [integrationAssignments.connectionId, integrationAssignments.tenantId],
          set: { enabled: true },
        });
      return { ok: true };
    });
  }

  private tenantIsolationFolder(slug: string): string {
    return `${TENANT_ISOLATION_PREFIX}/${slug}`;
  }

  private async getTenantSlug(tenantId: string): Promise<string> {
    return withBypassRls(this.database.db, async (db) => {
      const [row] = await db.select({ slug: tenants.slug }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
      if (!row) throw notFound('Tenant');
      return row.slug;
    });
  }

  private async readExportSettings(
    db: Parameters<Parameters<typeof withTenantContext>[2]>[0],
    tenantId: string,
  ): Promise<RecordingCloudExportSettings> {
    const [row] = await db
      .select()
      .from(tenantSettings)
      .where(and(eq(tenantSettings.tenantId, tenantId), eq(tenantSettings.key, CLOUD_EXPORT_SETTINGS_KEY)))
      .limit(1);
    if (!row?.value) {
      return RecordingCloudExportSettingsSchema.parse({
        enabled: false,
        provider: null,
        connectionId: null,
        folderPath: null,
        isolationFolder: null,
      });
    }
    return RecordingCloudExportSettingsSchema.parse(row.value);
  }

  private serializeConnection(
    row: typeof integrationConnections.$inferSelect,
    connectionSource: 'tenant_owned' | 'platform_owned' | 'platform_assigned',
  ): CloudStorageConnectionSummary {
    let accountEmail: string | null = null;
    let accountName: string | null = null;
    if (row.encryptedPayload) {
      try {
        const secrets = JSON.parse(
          decryptSecret(row.encryptedPayload, this.config.encryptionMasterKey),
        ) as Record<string, string>;
        accountEmail = secrets.accountEmail ?? null;
        accountName = secrets.accountName ?? null;
      } catch {
        // ignore decrypt errors in list view
      }
    }
    const config = (row.config ?? {}) as Record<string, unknown>;
    return {
      id: row.id,
      provider: CloudStorageProviderSchema.parse(row.provider),
      displayName: row.displayName,
      scopeType: row.scopeType as 'platform' | 'tenant',
      connectionSource,
      enabled: row.enabled,
      accountEmail,
      accountName,
      folderPath: config.folderPath ? String(config.folderPath) : null,
      validationStatus: row.validationStatus,
    };
  }

  private resolveOAuthConfig(provider: 'google_drive' | 'microsoft_onedrive') {
    if (provider === 'google_drive') {
      if (!this.config.googleDriveClientId || !this.config.googleDriveClientSecret) return null;
      return {
        clientId: this.config.googleDriveClientId,
        clientSecret: this.config.googleDriveClientSecret,
        authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        scope: 'https://www.googleapis.com/auth/drive.file openid email profile',
      };
    }
    if (!this.config.microsoftOneDriveClientId || !this.config.microsoftOneDriveClientSecret) return null;
    return {
      clientId: this.config.microsoftOneDriveClientId,
      clientSecret: this.config.microsoftOneDriveClientSecret,
      authorizeUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
      tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      scope: 'Files.ReadWrite offline_access User.Read openid email profile',
    };
  }

  private oauthCallbackUrl(provider: 'google_drive' | 'microsoft_onedrive'): string {
    const base = this.config.publicApiUrl.replace(/\/$/, '');
    return `${base}/api/v1/platform/cloud-storage/oauth/${provider}/callback`;
  }

  private oauthSetupHint(provider: 'google_drive' | 'microsoft_onedrive'): string {
    if (provider === 'google_drive') {
      return 'Set GOOGLE_DRIVE_CLIENT_ID and GOOGLE_DRIVE_CLIENT_SECRET in /opt/pbx/.env, then restart pbx-api.';
    }
    return 'Set MICROSOFT_ONEDRIVE_CLIENT_ID and MICROSOFT_ONEDRIVE_CLIENT_SECRET in /opt/pbx/.env, then restart pbx-api.';
  }

  private defaultReturnPath(scopeType: 'platform' | 'tenant', scopeId?: string): string {
    if (scopeType === 'tenant' && scopeId) {
      return `/t/${scopeId}/settings/cloud-storage`;
    }
    return '/platform/integrations/cloud-storage';
  }

  private async signOAuthState(state: OAuthState): Promise<string> {
    const secret = new TextEncoder().encode(this.config.jwtSecret);
    return await new SignJWT(state as unknown as Record<string, unknown>)
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime(`${OAUTH_STATE_TTL_SECONDS}s`)
      .sign(secret);
  }

  private async verifyOAuthState(token: string): Promise<OAuthState> {
    const secret = new TextEncoder().encode(this.config.jwtSecret);
    const { payload } = await jwtVerify(token, secret);
    return payload as unknown as OAuthState;
  }

  private async fetchAccountProfile(
    provider: 'google_drive' | 'microsoft_onedrive',
    accessToken: string,
  ): Promise<{ email?: string | undefined; name?: string | undefined }> {
    if (provider === 'google_drive') {
      const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) return {};
      const json = (await res.json()) as { email?: string; name?: string };
      return {
        ...(json.email ? { email: json.email } : {}),
        ...(json.name ? { name: json.name } : {}),
      };
    }
    const res = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return {};
    const json = (await res.json()) as { mail?: string; userPrincipalName?: string; displayName?: string };
    const email = json.mail ?? json.userPrincipalName;
    return {
      ...(email ? { email } : {}),
      ...(json.displayName ? { name: json.displayName } : {}),
    };
  }

  private assertPlatformManage(actor: AuthenticatedUser) {
    if (!actor.platformRoles.includes('platform_super_admin')) {
      throw tenantAccessDenied();
    }
  }

  private async assertTenantManage(actor: AuthenticatedUser, tenantId: string) {
    const isMember = actor.tenantMemberships.some((m) => m.tenantId === tenantId);
    const isPlatform = actor.platformRoles.includes('platform_super_admin');
    const isSupport = actor.supportSession?.tenantId === tenantId;
    if (!isMember && !isPlatform && !isSupport) {
      throw tenantAccessDenied();
    }
    const tenantRoles = actor.tenantMemberships.find((m) => m.tenantId === tenantId)?.roles ?? [];
    const permissions = resolveEffectivePermissions(actor.platformRoles, tenantRoles, tenantId);
    if (!hasAnyPermission(permissions, [Permission.TENANT_UPDATE, Permission.TENANT_EXTENSION_MANAGE])) {
      throw tenantAccessDenied();
    }
  }
}
