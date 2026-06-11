import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dirname, '../../../..');

export async function resolveAdminPassword(): Promise<string> {
  const bootstrapPath = join(REPO_ROOT, 'packages/database/.local/bootstrap-admin.json');
  const bootstrap = await readFile(bootstrapPath, 'utf8').catch(() => null);
  if (bootstrap) {
    const parsed = JSON.parse(bootstrap) as { password?: string };
    if (parsed.password) {
      return parsed.password;
    }
  }

  const envPassword = process.env.DEV_ADMIN_PASSWORD?.trim();
  if (envPassword && envPassword.length >= 12) {
    return envPassword;
  }

  throw new Error(
    'Admin password unavailable. Set DEV_ADMIN_PASSWORD (min 12 chars) in .env and run: ALLOW_DEV_SEED=true pnpm db:seed',
  );
}

export function resolveAdminEmail(): string {
  return process.env.DEV_ADMIN_EMAIL ?? 'admin@pbx.local';
}
