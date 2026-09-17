import { ApiError } from '@/lib/api-client';

/** Same-origin authenticated BFF path for browser audio playback over HTTPS. */
export function recordingBrowserContentPath(tenantId: string, recordingId: string): string {
  return `/api/backend/tenants/${tenantId}/recordings/${recordingId}/content`;
}

export function validateWavBytes(bytes: Uint8Array): void {
  if (bytes.length < 12) {
    throw new ApiError('INVALID_AUDIO', 'Recording response is not a valid RIFF/WAVE file', 200);
  }
  const riff = String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!);
  const wave = String.fromCharCode(bytes[8]!, bytes[9]!, bytes[10]!, bytes[11]!);
  if (riff !== 'RIFF' || wave !== 'WAVE') {
    throw new ApiError('INVALID_AUDIO', 'Recording response is not a valid RIFF/WAVE file', 200);
  }
}

export function isRecordingContentType(contentType: string): boolean {
  return contentType.startsWith('audio/') || contentType === 'application/octet-stream';
}

export async function fetchAudioBlobUrl(
  path: string,
  tenantId: string,
  options?: { validateWav?: boolean },
): Promise<string> {
  const res = await fetch(`/api/backend/${path.replace(/^\//, '')}`, {
    headers: {
      Accept: 'audio/*',
      'X-Tenant-Id': tenantId,
    },
    credentials: 'same-origin',
  });

  if (res.status === 401) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('pbx:session-expired'));
    }
    throw new ApiError('UNAUTHORIZED', 'Unauthorized', 401);
  }

  if (!res.ok) {
    throw new ApiError('REQUEST_FAILED', `Audio playback failed: ${res.status}`, res.status);
  }

  const contentType = res.headers.get('content-type') ?? '';
  if (!isRecordingContentType(contentType)) {
    throw new ApiError(
      'INVALID_CONTENT',
      `Unexpected audio content type: ${contentType || 'unknown'}`,
      res.status,
    );
  }

  const buffer = await res.arrayBuffer();
  if (options?.validateWav ?? false) {
    validateWavBytes(new Uint8Array(buffer));
  }

  const blob = new Blob([buffer], { type: contentType || 'application/octet-stream' });
  return URL.createObjectURL(blob);
}

export async function fetchRecordingBlobUrl(path: string, tenantId: string): Promise<string> {
  return fetchAudioBlobUrl(path, tenantId, { validateWav: true });
}
