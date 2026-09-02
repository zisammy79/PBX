import { decryptSecret, encryptSecret } from '@pbx/shared';
import { unlink } from 'node:fs/promises';
import {
  RecordingCloudExportSettingsSchema,
  type RecordingCloudExportSettings,
} from '@pbx/contracts';
import {
  calls,
  callRecordings,
  integrationAssignments,
  integrationConnections,
  recordingCloudExports,
  tenantSettings,
  withBypassRls,
  withTenantContext,
} from '@pbx/database';
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { createDatabase } from '@pbx/database';
import {
  buildRecordingFileName,
  resolveLocalRecordingPath,
  uploadRecordingToCloud,
  type OAuthTokens,
} from './cloud-upload.js';

const CLOUD_EXPORT_SETTINGS_KEY = 'recordings.cloudExport';
const NO_DRIVE_CODE = 'drive_not_connected';
const NO_DRIVE_MESSAGE = 'connect_drive_to_enable_recording';

type WorkerConfig = {
  encryptionMasterKey: string;
  callRecordingLocalRoot: string;
  googleDriveClientId?: string | undefined;
  googleDriveClientSecret?: string | undefined;
  microsoftOneDriveClientId?: string | undefined;
  microsoftOneDriveClientSecret?: string | undefined;
};

type CallEventPayload = {
  tenantId: string;
  callId: string;
  correlationId: string;
  eventType: string;
  payload: Record<string, unknown>;
};

export function shouldExportToGoogleDrive(settings: RecordingCloudExportSettings): boolean {
  return Boolean(settings.enabled && settings.provider === 'google_drive' && settings.connectionId);
}

export async function handleRecordingReady(
  event: CallEventPayload,
  db: ReturnType<typeof createDatabase>['db'],
  config: WorkerConfig,
): Promise<void> {
  if (event.eventType !== 'RECORDING_READY') return;

  const recordingId = String(event.payload.recordingId ?? '');
  if (!recordingId) return;

  const recording = await loadRecordingForTenant(db, event.tenantId, recordingId);
  if (!recording || recording.recording.status !== 'available' || !recording.recording.storageKey) return;

  const settings = await readCloudExportSettings(db, event.tenantId);
  if (!shouldExportToGoogleDrive(settings)) {
    await purgeLocalCopyAndFinalize(
      db,
      config.callRecordingLocalRoot,
      recording,
      'failed',
      NO_DRIVE_CODE,
      NO_DRIVE_MESSAGE,
    );
    return;
  }

  const connectionId = settings.connectionId;
  const provider = settings.provider;
  if (provider !== 'google_drive') return;
  if (!connectionId) return;
  const connection = await resolveCloudConnection(db, event.tenantId, connectionId, provider);
  if (!connection) {
    await purgeLocalCopyAndFinalize(
      db,
      config.callRecordingLocalRoot,
      recording,
      'failed',
      NO_DRIVE_CODE,
      NO_DRIVE_MESSAGE,
    );
    return;
  }

  const existing = await withBypassRls(db, async (tx) => {
    const [row] = await tx
      .select()
      .from(recordingCloudExports)
      .where(
        and(
          eq(recordingCloudExports.recordingId, recordingId),
          eq(recordingCloudExports.connectionId, connection.id),
        ),
      )
      .limit(1);
    return row;
  });
  if (existing?.status === 'exported') return;

  let exportId = existing?.id;
  if (!exportId) {
    const insertedId = await withBypassRls(db, async (tx) => {
      const [row] = await tx
        .insert(recordingCloudExports)
        .values({
          tenantId: event.tenantId,
          recordingId,
          connectionId: connection.id,
          provider,
          status: 'pending',
        })
        .onConflictDoNothing()
        .returning();
      return row?.id;
    });
    if (insertedId) {
      exportId = insertedId;
    } else {
      const retryRow = await withBypassRls(db, async (tx) => {
        const [row] = await tx
          .select()
          .from(recordingCloudExports)
          .where(
            and(
              eq(recordingCloudExports.recordingId, recordingId),
              eq(recordingCloudExports.connectionId, connection.id),
            ),
          )
          .limit(1);
        return row?.id;
      });
      exportId = retryRow;
    }
  }
  if (!exportId) return;

  await withBypassRls(db, async (tx) => {
    await tx
      .update(recordingCloudExports)
      .set({
        status: 'processing',
        attemptCount: (existing?.attemptCount ?? 0) + 1,
        lastAttemptAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(recordingCloudExports.id, exportId));
  });

  try {
    const secrets = JSON.parse(
      decryptSecret(connection.encryptedPayload!, config.encryptionMasterKey),
    ) as Record<string, string>;
    const tokens: OAuthTokens = {
      accessToken: secrets.accessToken ?? '',
      refreshToken: secrets.refreshToken ?? '',
      expiresAt: secrets.expiresAt ?? new Date(0).toISOString(),
      ...(secrets.accountEmail ? { accountEmail: secrets.accountEmail } : {}),
      ...(secrets.accountName ? { accountName: secrets.accountName } : {}),
    };
    const connConfig = (connection.config ?? {}) as Record<string, unknown>;
    const clientCreds = resolveOAuthClientCreds(connection.provider, config);
    if (!clientCreds) {
      throw new Error('oauth_client_not_configured');
    }

    const remoteParty =
      recording.call.direction === 'outbound'
        ? recording.call.calleeNumber
        : recording.call.callerNumber;
    const startedAt = recording.recording.startedAt ?? recording.call.startedAt ?? new Date();
    const fileName = buildRecordingFileName(
      recordingId,
      startedAt,
      recording.call.direction,
      remoteParty,
    );
    const filePath = resolveLocalRecordingPath(config.callRecordingLocalRoot, recording.recording.storageKey);

    const uploadInput: import('./cloud-upload.js').CloudUploadInput = {
      provider,
      tokens,
      clientId: clientCreds.clientId,
      clientSecret: clientCreds.clientSecret,
      folderPath: String(connConfig.folderPath ?? 'PBX Recordings'),
      fileName,
      filePath,
    };
    const tenantFolder = resolveTenantUploadFolder(settings, connection);
    uploadInput.tenantFolderPath = tenantFolder;
    if (connConfig.folderId) uploadInput.folderId = String(connConfig.folderId);

    const { result, refreshedTokens } = await uploadRecordingToCloud(uploadInput);

    if (refreshedTokens) {
      await persistRefreshedTokens(db, connection.id, secrets, refreshedTokens, config.encryptionMasterKey);
    }

    await withBypassRls(db, async (tx) => {
      await tx
        .update(recordingCloudExports)
        .set({
          status: 'exported',
          cloudFileId: result.fileId,
          cloudFilePath: result.filePath,
          cloudFileUrl: result.fileUrl ?? null,
          exportedAt: new Date(),
          errorCode: null,
          errorMessage: null,
          updatedAt: new Date(),
        })
        .where(eq(recordingCloudExports.id, exportId));
    });
    await purgeLocalCopyAndFinalize(db, config.callRecordingLocalRoot, recording, 'available');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'export_failed';
    await purgeLocalCopyAndFinalize(
      db,
      config.callRecordingLocalRoot,
      recording,
      'failed',
      message.split(':')[0] ?? 'export_failed',
      message.slice(0, 500),
    );
    await withBypassRls(db, async (tx) => {
      await tx
        .update(recordingCloudExports)
        .set({
          status: 'failed',
          errorCode: message.split(':')[0] ?? 'export_failed',
          errorMessage: message.slice(0, 500),
          updatedAt: new Date(),
        })
        .where(eq(recordingCloudExports.id, exportId));
    });
    throw err;
  }
}

export async function retryFailedCloudExports(
  db: ReturnType<typeof createDatabase>['db'],
  config: WorkerConfig,
  limit = 10,
): Promise<number> {
  const rows = await withBypassRls(db, async (tx) => {
    return tx
      .select()
      .from(recordingCloudExports)
      .where(inArray(recordingCloudExports.status, ['pending', 'failed']))
      .orderBy(desc(recordingCloudExports.updatedAt))
      .limit(limit);
  });

  let processed = 0;
  for (const row of rows) {
    if (row.attemptCount >= 5) continue;
    try {
      await handleRecordingReady(
        {
          tenantId: row.tenantId,
          callId: '',
          correlationId: '',
          eventType: 'RECORDING_READY',
          payload: { recordingId: row.recordingId },
        },
        db,
        config,
      );
      processed++;
    } catch {
      // logged by caller
    }
  }
  return processed;
}

async function loadRecordingForTenant(
  db: ReturnType<typeof createDatabase>['db'],
  tenantId: string,
  recordingId: string,
) {
  const [recording] = await withBypassRls(db, async (tx) => {
    return tx
      .select({
        recording: callRecordings,
        call: calls,
      })
      .from(callRecordings)
      .innerJoin(calls, eq(calls.id, callRecordings.callId))
      .where(and(eq(callRecordings.id, recordingId), eq(callRecordings.tenantId, tenantId)))
      .limit(1);
  });
  return recording;
}

export async function purgeLocalCopyAndFinalize(
  db: ReturnType<typeof createDatabase>['db'],
  localRoot: string,
  recording: {
    recording: typeof callRecordings.$inferSelect;
  },
  status: 'available' | 'failed',
  failureCode?: string,
  failureMessage?: string,
) {
  if (!recording.recording.storageKey) return;
  const filePath = resolveLocalRecordingPath(localRoot, recording.recording.storageKey);
  try {
    await unlink(filePath);
  } catch (err) {
    if (!(err instanceof Error) || !('code' in err) || (err as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw err;
    }
  }
  await withBypassRls(db, async (tx) => {
    await tx
      .update(callRecordings)
      .set({
        status,
        storageBackend: 'tenant_cloud',
        storageKey: null,
        completedAt: recording.recording.completedAt ?? new Date(),
        availableAt: status === 'available' ? recording.recording.availableAt ?? new Date() : recording.recording.availableAt,
        failureCode: status === 'failed' ? (failureCode ?? 'recording_unavailable') : null,
        failureMessage: status === 'failed' ? (failureMessage ?? 'recording_unavailable') : null,
        updatedAt: new Date(),
      })
      .where(eq(callRecordings.id, recording.recording.id));
  });
}

async function readCloudExportSettings(
  db: ReturnType<typeof createDatabase>['db'],
  tenantId: string,
): Promise<RecordingCloudExportSettings> {
  return withTenantContext(db, tenantId, async (tx) => {
    const [row] = await tx
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
  });
}

async function resolveCloudConnection(
  db: ReturnType<typeof createDatabase>['db'],
  tenantId: string,
  connectionId: string,
  provider: string,
) {
  return withBypassRls(db, async (tx) => {
    const [row] = await tx
      .select()
      .from(integrationConnections)
      .where(
        and(
          eq(integrationConnections.id, connectionId),
          eq(integrationConnections.integrationType, 'cloud_storage'),
          eq(integrationConnections.provider, provider),
          eq(integrationConnections.enabled, true),
        ),
      )
      .limit(1);
    if (!row?.encryptedPayload) return null;

    if (row.scopeType === 'tenant' && row.scopeId !== tenantId) return null;
    if (row.scopeType === 'platform') {
      const [assignment] = await tx
        .select()
        .from(integrationAssignments)
        .where(
          and(
            eq(integrationAssignments.connectionId, row.id),
            eq(integrationAssignments.tenantId, tenantId),
            eq(integrationAssignments.enabled, true),
          ),
        )
        .limit(1);
      if (!assignment) return null;
    }
    return row;
  });
}

function resolveOAuthClientCreds(
  provider: string,
  config: WorkerConfig,
): { clientId: string; clientSecret: string } | null {
  if (provider === 'google_drive') {
    if (!config.googleDriveClientId || !config.googleDriveClientSecret) return null;
    return { clientId: config.googleDriveClientId, clientSecret: config.googleDriveClientSecret };
  }
  if (provider === 'microsoft_onedrive') {
    if (!config.microsoftOneDriveClientId || !config.microsoftOneDriveClientSecret) return null;
    return {
      clientId: config.microsoftOneDriveClientId,
      clientSecret: config.microsoftOneDriveClientSecret,
    };
  }
  return null;
}

function resolveTenantUploadFolder(
  settings: RecordingCloudExportSettings,
  connection: { scopeType: string },
): string {
  if (connection.scopeType === 'tenant') {
    return settings.folderPath?.trim() || 'Call Recordings';
  }
  if (settings.isolationFolder) {
    return settings.folderPath
      ? `${settings.isolationFolder}/${settings.folderPath}`
      : settings.isolationFolder;
  }
  return settings.folderPath?.trim() || 'Call Recordings';
}

async function persistRefreshedTokens(
  db: ReturnType<typeof createDatabase>['db'],
  connectionId: string,
  existing: Record<string, string>,
  tokens: OAuthTokens,
  encryptionMasterKey: string,
) {
  const merged = {
    ...existing,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: tokens.expiresAt,
  };
  const encrypted = encryptSecret(JSON.stringify(merged), encryptionMasterKey);
  await withBypassRls(db, async (tx) => {
    await tx
      .update(integrationConnections)
      .set({ encryptedPayload: encrypted, updatedAt: new Date() })
      .where(eq(integrationConnections.id, connectionId));
  });
}
