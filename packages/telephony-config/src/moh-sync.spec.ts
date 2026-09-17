import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import {
  mohClassAsteriskDirectory,
  mohClassHostSyncDir,
  syncMohMediaClasses,
} from './moh-sync.js';
import type { TelephonyMohClassRecord } from './callflow.types.js';

describe('syncMohMediaClasses', () => {
  const tempRoots: string[] = [];

  afterEach(async () => {
    await Promise.all(tempRoots.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  async function makeTempRoot(): Promise<string> {
    const dir = join(tmpdir(), `pbx-moh-sync-${randomUUID()}`);
    tempRoots.push(dir);
    await mkdir(dir, { recursive: true });
    return dir;
  }

  it('copies media files into per-class sync directories', async () => {
    const root = await makeTempRoot();
    const mediaRoot = join(root, 'media');
    const syncRoot = join(root, 'generated', 'moh');
    const tenantId = '11111111-1111-1111-1111-111111111111';
    const mohClassId = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
    const asteriskClassName = 'pbx_acme_moh_ffffffff';
    const storageKey = `${tenantId}/hold.wav`;

    await mkdir(join(mediaRoot, tenantId), { recursive: true });
    await writeFile(join(mediaRoot, storageKey), 'RIFF-test-wav');

    const mohClasses: TelephonyMohClassRecord[] = [
      {
        tenantId,
        tenantSlug: 'acme',
        mohClassId,
        name: 'Default hold',
        asteriskClassName,
        randomize: true,
        tracks: [{ fileName: 'hold.wav', storageKey }],
      },
    ];

    const result = await syncMohMediaClasses({
      mediaSourceRoot: mediaRoot,
      syncHostRoot: syncRoot,
      mohClasses,
    });

    expect(result.synced).toEqual([{ asteriskClassName, files: ['hold.wav'] }]);
    expect(result.skipped).toEqual([]);

    const destDir = mohClassHostSyncDir(syncRoot, asteriskClassName);
    const destFile = join(destDir, 'hold.wav');
    const content = await import('node:fs/promises').then((fs) => fs.readFile(destFile, 'utf8'));
    expect(content).toBe('RIFF-test-wav');
    expect(mohClassAsteriskDirectory(asteriskClassName)).toBe(
      '/etc/asterisk/pbx-generated/moh/pbx_acme_moh_ffffffff',
    );
  });

  it('records skipped tracks when source media is missing', async () => {
    const root = await makeTempRoot();
    const syncRoot = join(root, 'moh');
    const asteriskClassName = 'pbx_acme_moh_aaaaaaaa';

    const result = await syncMohMediaClasses({
      mediaSourceRoot: join(root, 'media'),
      syncHostRoot: syncRoot,
      mohClasses: [
        {
          tenantId: '11111111-1111-1111-1111-111111111111',
          tenantSlug: 'acme',
          mohClassId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          name: 'Missing',
          asteriskClassName,
          randomize: false,
          tracks: [{ fileName: 'missing.wav', storageKey: '11111111-1111-1111-1111-111111111111/nope.wav' }],
        },
      ],
    });

    expect(result.synced).toEqual([]);
    expect(result.skipped).toEqual([
      {
        asteriskClassName,
        storageKey: '11111111-1111-1111-1111-111111111111/nope.wav',
        reason: 'source_missing',
      },
    ]);
  });
});
