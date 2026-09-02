import { describe, expect, it, vi, beforeEach } from 'vitest';
import { mkdtemp, mkdir, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const mocked = vi.hoisted(() => {
  const updates: Array<Record<string, unknown>> = [];
  const where = vi.fn(async () => undefined);
  const set = vi.fn((payload: Record<string, unknown>) => {
    updates.push(payload);
    return { where };
  });
  const update = vi.fn(() => ({ set }));
  const tx = { update };
  return {
    tx,
    updates,
    update,
    set,
    where,
  };
});

vi.mock('@pbx/database', () => ({
  callRecordings: { id: 'id' },
  calls: {},
  integrationAssignments: {},
  integrationConnections: {},
  recordingCloudExports: {},
  tenantSettings: {},
  withBypassRls: async (_db: unknown, cb: (tx: unknown) => Promise<unknown>) => cb(mocked.tx),
  withTenantContext: async (_db: unknown, _tenantId: string, cb: (tx: unknown) => Promise<unknown>) =>
    cb({}),
}));

vi.mock('drizzle-orm', () => ({
  and: (...args: unknown[]) => args,
  desc: (value: unknown) => value,
  eq: (_left: unknown, _right: unknown) => ({ ok: true }),
  inArray: (_left: unknown, _right: unknown[]) => ({ ok: true }),
}));

import {
  purgeLocalCopyAndFinalize,
  shouldExportToGoogleDrive,
} from './recording-cloud-export.js';

describe('recording cloud export privacy policy', () => {
  beforeEach(() => {
    mocked.updates.length = 0;
    mocked.update.mockClear();
    mocked.set.mockClear();
    mocked.where.mockClear();
  });

  it('requires enabled Google Drive connection before exporting', () => {
    expect(
      shouldExportToGoogleDrive({
        enabled: true,
        provider: 'google_drive',
        connectionId: '11111111-1111-1111-1111-111111111111',
        folderPath: null,
        isolationFolder: null,
      }),
    ).toBe(true);
    expect(
      shouldExportToGoogleDrive({
        enabled: false,
        provider: 'google_drive',
        connectionId: '11111111-1111-1111-1111-111111111111',
        folderPath: null,
        isolationFolder: null,
      }),
    ).toBe(false);
    expect(
      shouldExportToGoogleDrive({
        enabled: true,
        provider: 'microsoft_onedrive',
        connectionId: '11111111-1111-1111-1111-111111111111',
        folderPath: null,
        isolationFolder: null,
      }),
    ).toBe(false);
  });

  it('purges local recording file and strips storage key', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'pbx-worker-'));
    const storageKey = 'tenant-a/2026/09/sample.wav';
    const filePath = path.join(root, 'tenant-a/2026/09/sample.wav');
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, Buffer.from('audio-bytes'));

    await purgeLocalCopyAndFinalize(
      {} as never,
      root,
      {
        recording: {
          id: 'rec-1',
          storageKey,
          completedAt: null,
          availableAt: null,
        } as never,
      },
      'available',
    );

    await expect(stat(filePath)).rejects.toBeDefined();
    expect(mocked.updates).toHaveLength(1);
    expect(mocked.updates[0]).toMatchObject({
      status: 'available',
      storageBackend: 'tenant_cloud',
      storageKey: null,
      failureCode: null,
      failureMessage: null,
    });
  });
});
