import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api-client';
import {
  fetchRecordingBlobUrl,
  isRecordingContentType,
  validateWavBytes,
} from '@/lib/recording-playback';

function minimalWavBuffer(extra = 0): ArrayBuffer {
  const size = 12 + extra;
  const buffer = new ArrayBuffer(size);
  const bytes = new Uint8Array(buffer);
  bytes.set([0x52, 0x49, 0x46, 0x46]); // RIFF
  bytes.set([0x57, 0x41, 0x56, 0x45], 8); // WAVE
  return buffer;
}

describe('recording-playback', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('accepts audio and octet-stream content types', () => {
    expect(isRecordingContentType('audio/wav')).toBe(true);
    expect(isRecordingContentType('application/octet-stream')).toBe(true);
    expect(isRecordingContentType('application/json')).toBe(false);
  });

  it('validates RIFF/WAVE headers', () => {
    expect(() => validateWavBytes(new Uint8Array(minimalWavBuffer()))).not.toThrow();
    expect(() => validateWavBytes(new Uint8Array([0, 1, 2]))).toThrow(/RIFF\/WAVE/);
  });

  it('uses arrayBuffer and creates blob URL for valid WAV', async () => {
    const createObjectURL = vi.fn((_blob: Blob) => 'blob:recording');
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL: vi.fn() });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: (name: string) => (name === 'content-type' ? 'audio/wav' : null) },
        arrayBuffer: async () => minimalWavBuffer(320),
      }),
    );

    const url = await fetchRecordingBlobUrl('tenants/t/recordings/r/content', 'tenant-t');
    expect(url).toBe('blob:recording');
    expect(createObjectURL).toHaveBeenCalledOnce();
    const blob = createObjectURL.mock.calls[0]![0] as Blob;
    expect(blob.type).toBe('audio/wav');
  });

  it('rejects JSON content type', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        arrayBuffer: async () => minimalWavBuffer(),
      }),
    );

    await expect(fetchRecordingBlobUrl('tenants/t/recordings/r/content', 'tenant-t')).rejects.toMatchObject({
      code: 'INVALID_CONTENT',
    });
  });

  it('rejects HTML content type', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => 'text/html' },
        arrayBuffer: async () => minimalWavBuffer(),
      }),
    );

    await expect(fetchRecordingBlobUrl('tenants/t/recordings/r/content', 'tenant-t')).rejects.toMatchObject({
      code: 'INVALID_CONTENT',
    });
  });

  it('rejects non-2xx responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        headers: { get: () => 'application/json' },
        arrayBuffer: async () => new ArrayBuffer(0),
      }),
    );

    await expect(fetchRecordingBlobUrl('tenants/t/recordings/r/content', 'tenant-t')).rejects.toMatchObject({
      code: 'REQUEST_FAILED',
      status: 404,
    });
  });

  it('rejects invalid WAV bytes after successful response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => 'audio/wav' },
        arrayBuffer: async () => new TextEncoder().encode('not-wav').buffer,
      }),
    );

    await expect(fetchRecordingBlobUrl('tenants/t/recordings/r/content', 'tenant-t')).rejects.toMatchObject({
      code: 'INVALID_AUDIO',
    });
  });

  it('dispatches session-expired on 401', async () => {
    const handler = vi.fn();
    window.addEventListener('pbx:session-expired', handler);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        headers: { get: () => null },
        arrayBuffer: async () => new ArrayBuffer(0),
      }),
    );

    await expect(fetchRecordingBlobUrl('tenants/t/recordings/r/content', 'tenant-t')).rejects.toBeInstanceOf(
      ApiError,
    );
    expect(handler).toHaveBeenCalledTimes(1);
    window.removeEventListener('pbx:session-expired', handler);
  });

  it('does not call response.json', async () => {
    const json = vi.fn();
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => 'audio/wav' },
        arrayBuffer: async () => minimalWavBuffer(),
        json,
        text: vi.fn(),
        blob: vi.fn(),
      }),
    );

    await fetchRecordingBlobUrl('tenants/t/recordings/r/content', 'tenant-t');
    expect(json).not.toHaveBeenCalled();
  });
});
