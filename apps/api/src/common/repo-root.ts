import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

function isValidRepoRoot(root: string): boolean {
  return existsSync(join(root, 'infrastructure', 'asterisk'));
}

export function resolveRepoRoot(configured?: string): string {
  const auto = join(fileURLToPath(new URL('../../../../', import.meta.url)));
  const candidates = [configured, '/opt/pbx', auto].filter(Boolean) as string[];

  for (const root of candidates) {
    if (isValidRepoRoot(root)) {
      return root;
    }
  }

  return configured ?? auto;
}
