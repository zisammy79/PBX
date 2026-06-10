import { chmod, copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { GeneratedTelephonyConfig } from './types.js';
import { generatedPaths } from './paths.js';
import { validateGeneratedConfig } from './validate.js';

const SECRET_MODE = 0o600;
const DIR_MODE = 0o700;

async function writeSecretFile(path: string, content: string): Promise<void> {
  await writeFile(path, content, { mode: SECRET_MODE });
  await chmod(path, SECRET_MODE);
}

async function copyDirFiles(sourceDir: string, destDir: string, files: string[]): Promise<void> {
  await mkdir(destDir, { recursive: true, mode: DIR_MODE });
  for (const file of files) {
    await copyFile(join(sourceDir, file), join(destDir, file));
    if (file.endsWith('.conf')) {
      await chmod(join(destDir, file), SECRET_MODE);
    }
  }
}

export interface ActivationResult {
  activated: boolean;
  version: string;
  previousVersion?: string;
  error?: string;
}

export async function writeStagingConfig(
  repoRoot: string,
  config: GeneratedTelephonyConfig,
): Promise<void> {
  const paths = generatedPaths(repoRoot);
  await mkdir(paths.staging, { recursive: true, mode: DIR_MODE });
  await writeSecretFile(paths.stagingPjsip, config.pjsipTenants);
  await writeSecretFile(paths.stagingExtensions, config.extensionsTenants);
  await writeFile(paths.stagingManifest, JSON.stringify(config.manifest, null, 2), {
    mode: SECRET_MODE,
  });
}

export async function activateStagingConfig(repoRoot: string): Promise<ActivationResult> {
  const validation = validateGeneratedConfig(await readStagingAsConfig(repoRoot));
  if (!validation.valid) {
    return { activated: false, version: 'unknown', error: validation.errors.join('; ') };
  }

  const paths = generatedPaths(repoRoot);
  const files = ['pjsip-tenants.conf', 'extensions-tenants.conf', 'manifest.json'];

  let previousVersion: string | undefined;
  try {
    const current = await readFile(paths.activeManifest, 'utf8');
    previousVersion = JSON.parse(current).version;
    await copyDirFiles(paths.active, paths.lastKnownGood, files);
  } catch {
    await mkdir(paths.lastKnownGood, { recursive: true, mode: DIR_MODE });
  }

  const tempActive = join(paths.root, '.activating');
  await mkdir(tempActive, { recursive: true, mode: DIR_MODE });
  await copyDirFiles(paths.staging, tempActive, files);

  try {
    for (const file of files) {
      await rename(join(tempActive, file), join(paths.active, file));
    }
  } catch (err) {
    if (previousVersion) {
      await copyDirFiles(paths.lastKnownGood, paths.active, files).catch(() => undefined);
    }
    return {
      activated: false,
      version: 'unknown',
      error: err instanceof Error ? err.message : 'Activation failed',
    };
  }

  const manifest = JSON.parse(await readFile(paths.activeManifest, 'utf8'));
  return {
    activated: true,
    version: manifest.version,
    ...(previousVersion ? { previousVersion } : {}),
  };
}

export async function rollbackToLastKnownGood(repoRoot: string): Promise<ActivationResult> {
  const paths = generatedPaths(repoRoot);
  const files = ['pjsip-tenants.conf', 'extensions-tenants.conf', 'manifest.json'];
  try {
    await copyDirFiles(paths.lastKnownGood, paths.active, files);
    const manifest = JSON.parse(await readFile(paths.activeManifest, 'utf8'));
    return { activated: true, version: manifest.version };
  } catch (err) {
    return {
      activated: false,
      version: 'unknown',
      error: err instanceof Error ? err.message : 'Rollback failed',
    };
  }
}

async function readStagingAsConfig(repoRoot: string): Promise<GeneratedTelephonyConfig> {
  const paths = generatedPaths(repoRoot);
  const pjsipTenants = await readFile(paths.stagingPjsip, 'utf8');
  const extensionsTenants = await readFile(paths.stagingExtensions, 'utf8');
  const manifest = JSON.parse(await readFile(paths.stagingManifest, 'utf8'));
  return {
    version: manifest.version,
    generatedAt: manifest.generatedAt,
    tenantIds: manifest.tenantIds,
    pjsipTenants,
    extensionsTenants,
    manifest,
  };
}

async function ariRequest(
  base: string,
  authHeader: string,
  path: string,
  method: 'PUT' | 'POST',
): Promise<Response> {
  return fetch(`${base}${path}`, {
    method,
    headers: { Authorization: authHeader },
  });
}

export async function reloadAsterisk(options: {
  ariUrl: string;
  ariUsername: string;
  ariPassword: string;
}): Promise<void> {
  const base = options.ariUrl.replace(/\/$/, '');
  const authHeader = `Basic ${Buffer.from(`${options.ariUsername}:${options.ariPassword}`).toString('base64')}`;

  const reloads: Array<{ path: string; method: 'PUT' | 'POST'; okStatuses: number[] }> = [
    { path: '/asterisk/modules/res_pjsip.so', method: 'PUT', okStatuses: [204, 409] },
    { path: '/asterisk/modules/res_pjsip', method: 'PUT', okStatuses: [204, 409] },
    { path: '/asterisk/modules/pbx_config.so', method: 'PUT', okStatuses: [204, 409] },
  ];

  const errors: string[] = [];
  for (const reload of reloads) {
    const res = await ariRequest(base, authHeader, reload.path, reload.method);
    if (!reload.okStatuses.includes(res.status)) {
      errors.push(`${reload.method} ${reload.path}: ${res.status}`);
    }
  }

  if (errors.length === reloads.length) {
    throw new Error(`Asterisk reload failed: ${errors.join('; ')}`);
  }
}
