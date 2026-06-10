import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export function resolveRepoRoot(configured?: string): string {
  if (configured) {
    return configured;
  }
  return join(fileURLToPath(new URL('../../../../', import.meta.url)));
}
