import { readFile } from 'node:fs/promises';
import path from 'node:path';

export type OAuthTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  accountEmail?: string | undefined;
  accountName?: string | undefined;
};

export type CloudUploadInput = {
  provider: 'google_drive' | 'microsoft_onedrive';
  tokens: OAuthTokens;
  clientId: string;
  clientSecret: string;
  folderPath: string;
  tenantFolderPath?: string | undefined;
  folderId?: string | undefined;
  fileName: string;
  filePath: string;
};

export type CloudUploadResult = {
  fileId: string;
  filePath: string;
  fileUrl?: string | undefined;
};

async function refreshGoogleToken(
  tokens: OAuthTokens,
  clientId: string,
  clientSecret: string,
): Promise<OAuthTokens> {
  const expiresAt = Date.parse(tokens.expiresAt);
  if (expiresAt > Date.now() + 60_000) return tokens;

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
    refresh_token: tokens.refreshToken,
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    throw new Error(`google_token_refresh_failed:${res.status}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  return {
    ...tokens,
    accessToken: json.access_token,
    expiresAt: new Date(Date.now() + json.expires_in * 1000).toISOString(),
  };
}

async function refreshMicrosoftToken(
  tokens: OAuthTokens,
  clientId: string,
  clientSecret: string,
): Promise<OAuthTokens> {
  const expiresAt = Date.parse(tokens.expiresAt);
  if (expiresAt > Date.now() + 60_000) return tokens;

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
    refresh_token: tokens.refreshToken,
    scope: 'Files.ReadWrite offline_access User.Read',
  });
  const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    throw new Error(`microsoft_token_refresh_failed:${res.status}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number; refresh_token?: string };
  return {
    ...tokens,
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? tokens.refreshToken,
    expiresAt: new Date(Date.now() + json.expires_in * 1000).toISOString(),
  };
}

function joinCloudPath(...parts: string[]): string {
  return parts
    .filter(Boolean)
    .map((p) => p.replace(/^\/+|\/+$/g, ''))
    .join('/');
}

async function uploadGoogleDrive(input: CloudUploadInput, tokens: OAuthTokens): Promise<CloudUploadResult> {
  const bytes = await readFile(input.filePath);
  const relativePath = joinCloudPath(input.folderPath, input.tenantFolderPath ?? '', input.fileName);
  const metadata: Record<string, unknown> = { name: input.fileName };
  if (input.folderId) {
    metadata.parents = [input.folderId];
  }

  const boundary = 'pbx_recording_upload';
  const metaJson = JSON.stringify(metadata);
  const preamble = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metaJson}\r\n--${boundary}\r\nContent-Type: audio/wav\r\n\r\n`;
  const closing = `\r\n--${boundary}--`;
  const body = Buffer.concat([
    Buffer.from(preamble, 'utf8'),
    bytes,
    Buffer.from(closing, 'utf8'),
  ]);

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink,name', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokens.accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  if (!res.ok) {
    throw new Error(`google_upload_failed:${res.status}`);
  }
  const json = (await res.json()) as { id: string; webViewLink?: string; name?: string };
  return {
    fileId: json.id,
    filePath: relativePath,
    fileUrl: json.webViewLink,
  };
}

async function uploadOneDrive(input: CloudUploadInput, tokens: OAuthTokens): Promise<CloudUploadResult> {
  const bytes = await readFile(input.filePath);
  const relativePath = joinCloudPath(input.folderPath, input.tenantFolderPath ?? '', input.fileName);
  const encodedPath = relativePath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  const url = `https://graph.microsoft.com/v1.0/me/drive/root:/${encodedPath}:/content`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${tokens.accessToken}`,
      'Content-Type': 'audio/wav',
    },
    body: bytes,
  });
  if (!res.ok) {
    throw new Error(`onedrive_upload_failed:${res.status}`);
  }
  const json = (await res.json()) as { id: string; webUrl?: string; name?: string };
  return {
    fileId: json.id,
    filePath: relativePath,
    fileUrl: json.webUrl,
  };
}

export async function uploadRecordingToCloud(input: CloudUploadInput): Promise<{
  result: CloudUploadResult;
  refreshedTokens?: OAuthTokens;
}> {
  let tokens = input.tokens;
  if (input.provider === 'google_drive') {
    tokens = await refreshGoogleToken(tokens, input.clientId, input.clientSecret);
    const result = await uploadGoogleDrive(input, tokens);
    const refreshed = tokens.accessToken !== input.tokens.accessToken ? tokens : undefined;
    return refreshed ? { result, refreshedTokens: refreshed } : { result };
  }
  tokens = await refreshMicrosoftToken(tokens, input.clientId, input.clientSecret);
  const result = await uploadOneDrive(input, tokens);
  const refreshed = tokens.accessToken !== input.tokens.accessToken ? tokens : undefined;
  return refreshed ? { result, refreshedTokens: refreshed } : { result };
}

export function resolveLocalRecordingPath(localRoot: string, storageKey: string): string {
  const cleanKey = storageKey.replace(/\\/g, '/').replace(/^\/+/, '');
  const resolved = path.resolve(localRoot, cleanKey);
  const rootResolved = path.resolve(localRoot);
  if (resolved !== rootResolved && !resolved.startsWith(rootResolved + path.sep)) {
    throw new Error('invalid_storage_key');
  }
  return resolved;
}

export function buildRecordingFileName(
  recordingId: string,
  startedAt: Date,
  direction: string,
  remoteParty: string | null,
): string {
  const stamp = startedAt.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const party = (remoteParty ?? 'unknown').replace(/[^\w+.-]/g, '_').slice(0, 32);
  return `${stamp}_${direction}_${party}_${recordingId.slice(0, 8)}.wav`;
}
