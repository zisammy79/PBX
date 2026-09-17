import { chmod, copyFile, mkdir, readdir, rm, stat, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { TelephonyMohClassRecord } from './callflow.types.js';
import { resolveGeneratedRoot } from './paths.js';

/** Path prefix visible inside the Asterisk container (bind-mounted generated tree). */
export const ASTERISK_MOH_CONTAINER_PREFIX = '/etc/asterisk/pbx-generated/moh';

const DIR_MODE = 0o750;
const FILE_MODE = 0o640;

export function resolveMohSyncHostRoot(repoRoot: string, override?: string): string {
  if (override) return override;
  return join(resolveGeneratedRoot(repoRoot), 'moh');
}

export function mohClassHostSyncDir(syncHostRoot: string, asteriskClassName: string): string {
  return join(syncHostRoot, asteriskClassName);
}

export function mohClassAsteriskDirectory(asteriskClassName: string): string {
  return `${ASTERISK_MOH_CONTAINER_PREFIX}/${asteriskClassName}`;
}

/** @deprecated Use mohClassAsteriskDirectory(asteriskClassName) — kept for transitional callers. */
export function mohClassMediaDirectory(tenantSlug: string, mohClassId: string): string {
  const shortId = mohClassId.replace(/-/g, '').slice(0, 8);
  return `${ASTERISK_MOH_CONTAINER_PREFIX}/pbx_${tenantSlug}_moh_${shortId}`;
}

export interface MohSyncResult {
  synced: Array<{ asteriskClassName: string; files: string[] }>;
  skipped: Array<{ asteriskClassName: string; storageKey: string; reason: string }>;
}

export interface SyncMohMediaOptions {
  mediaSourceRoot: string;
  syncHostRoot: string;
  mohClasses: TelephonyMohClassRecord[];
  useSymlink?: boolean;
}

async function clearClassDirectory(classDir: string): Promise<void> {
  try {
    const entries = await readdir(classDir);
    for (const entry of entries) {
      await rm(join(classDir, entry), { recursive: true, force: true });
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
}

async function linkOrCopyFile(
  sourcePath: string,
  destPath: string,
  useSymlink: boolean,
): Promise<void> {
  if (useSymlink) {
    await symlink(sourcePath, destPath);
  } else {
    await copyFile(sourcePath, destPath);
  }
  await chmod(destPath, FILE_MODE);
}

export async function syncMohMediaClasses(options: SyncMohMediaOptions): Promise<MohSyncResult> {
  const result: MohSyncResult = { synced: [], skipped: [] };
  const useSymlink = options.useSymlink ?? false;

  for (const mohClass of options.mohClasses) {
    if (mohClass.tracks.length === 0) continue;

    const classDir = mohClassHostSyncDir(options.syncHostRoot, mohClass.asteriskClassName);
    await mkdir(classDir, { recursive: true, mode: DIR_MODE });
    await clearClassDirectory(classDir);

    const copied: string[] = [];
    for (const track of mohClass.tracks) {
      const sourcePath = join(options.mediaSourceRoot, track.storageKey);
      const destPath = join(classDir, track.fileName);
      try {
        await stat(sourcePath);
        await linkOrCopyFile(sourcePath, destPath, useSymlink);
        copied.push(track.fileName);
      } catch {
        result.skipped.push({
          asteriskClassName: mohClass.asteriskClassName,
          storageKey: track.storageKey,
          reason: 'source_missing',
        });
      }
    }

    if (copied.length > 0) {
      result.synced.push({ asteriskClassName: mohClass.asteriskClassName, files: copied });
    }
  }

  return result;
}
