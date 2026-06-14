import { describe, expect, it } from 'vitest';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { LocalRecordingStorageService } from './local-recording-storage.service.js';
import type { AppConfig } from '../config.js';

function service(root: string) {
  const config = { callRecordingStorageBackend: 'local', callRecordingLocalRoot: root } as AppConfig;
  return new LocalRecordingStorageService(config);
}

describe('LocalRecordingStorageService', () => {
  it('rejects traversal in storage keys', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'pbx-rec-'));
    const svc = service(root);
    expect(() => svc.resolveSafePath('../secret.wav')).toThrow(/invalid_storage_key/);
  });

  it('reads byte ranges', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'pbx-rec-'));
    const tenantId = '11111111-1111-1111-1111-111111111111';
    const key = `${tenantId}/2026/06/rec.wav`;
    const filePath = path.join(root, tenantId, '2026', '06', 'rec.wav');
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, Buffer.from('0123456789'));

    const svc = service(root);
    const result = await svc.openReadStream(key, 'wav', 'bytes=2-5');
    expect(result.contentLength).toBe(4);
    expect(result.contentRange).toEqual({ start: 2, end: 5, total: 10 });
    expect(result.contentType).toBe('audio/wav');
  });

  it('returns full file without range', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'pbx-rec-'));
    const key = 'tenant/2026/06/full.wav';
    const filePath = path.join(root, 'tenant', '2026', '06', 'full.wav');
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, Buffer.from('0123456789'));

    const svc = service(root);
    const result = await svc.openReadStream(key, 'wav');
    expect(result.contentLength).toBe(10);
    expect(result.contentRange).toBeUndefined();
    expect(result.contentType).toBe('audio/wav');
  });

  it('rejects invalid byte ranges', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'pbx-rec-'));
    const key = 'tenant/2026/06/full.wav';
    const filePath = path.join(root, 'tenant', '2026', '06', 'full.wav');
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, Buffer.from('0123456789'));

    const svc = service(root);
    await expect(svc.openReadStream(key, 'wav', 'bytes=50-60')).rejects.toBeInstanceOf(RangeError);
    await expect(svc.openReadStream(key, 'wav', 'invalid')).rejects.toBeInstanceOf(RangeError);
  });
});
