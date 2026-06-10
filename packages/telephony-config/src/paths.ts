import { join } from 'node:path';

export function resolveGeneratedRoot(repoRoot: string): string {
  return join(repoRoot, 'infrastructure/asterisk/generated');
}

export function generatedPaths(repoRoot: string) {
  const root = resolveGeneratedRoot(repoRoot);
  return {
    root,
    active: join(root, 'active'),
    staging: join(root, 'staging'),
    lastKnownGood: join(root, 'last-known-good'),
    activePjsip: join(root, 'active', 'pjsip-tenants.conf'),
    activeExtensions: join(root, 'active', 'extensions-tenants.conf'),
    stagingPjsip: join(root, 'staging', 'pjsip-tenants.conf'),
    stagingExtensions: join(root, 'staging', 'extensions-tenants.conf'),
    activeManifest: join(root, 'active', 'manifest.json'),
    stagingManifest: join(root, 'staging', 'manifest.json'),
  };
}
