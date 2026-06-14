import { ApiError } from '@/lib/api-client';

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

export async function fetchRecordingBlobUrl(path: string, tenantId: string): Promise<string> {
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
    throw new ApiError('REQUEST_FAILED', `Recording playback failed: ${res.status}`, res.status);
  }

  const contentType = res.headers.get('content-type') ?? '';
  if (!isRecordingContentType(contentType)) {
    throw new ApiError(
      'INVALID_CONTENT',
      `Unexpected recording content type: ${contentType || 'unknown'}`,
      res.status,
    );
  }

  const buffer = await res.arrayBuffer();
  validateWavBytes(new Uint8Array(buffer));

  const blob = new Blob([buffer], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
}
