/**
 * Create a platform_super_admin automation API token (plaintext shown once).
 *
 * Usage:
 *   PBX_PLATFORM_TOKEN_NAME="production-automation" \
 *   pnpm exec tsx scripts/create-platform-api-token.ts
 *
 * Optional:
 *   PBX_WRITE_TOKEN_TO_ROOT_FILE=true  -> writes token to /root/.pbx-platform-api-token (mode 600)
 */
import { chmodSync, writeFileSync } from 'node:fs';
import { createDatabase, platformApiTokens, users, withBypassRls } from '@pbx/database';
import {
  formatPlatformApiToken,
  generatePlatformApiTokenPrefix,
  generatePlatformApiTokenSecret,
  hashPlatformApiTokenSecret,
} from '@pbx/shared';
import { eq } from 'drizzle-orm';

function resolveDatabaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error('DATABASE_URL is required');
  }
  return url;
}

async function main() {
  const name = process.env.PBX_PLATFORM_TOKEN_NAME?.trim() || 'production-automation';
  const expiresAtRaw = process.env.PBX_PLATFORM_TOKEN_EXPIRES_AT?.trim();
  const expiresAt = expiresAtRaw ? new Date(expiresAtRaw) : null;
  if (expiresAt && Number.isNaN(expiresAt.getTime())) {
    throw new Error('PBX_PLATFORM_TOKEN_EXPIRES_AT is invalid');
  }

  const db = createDatabase({ url: resolveDatabaseUrl() });
  const prefix = generatePlatformApiTokenPrefix();
  const secret = generatePlatformApiTokenSecret();
  const token = formatPlatformApiToken(prefix, secret);
  const tokenHash = hashPlatformApiTokenSecret(secret);

  const [admin] = await withBypassRls(db.db, async (tx) =>
    tx.select().from(users).where(eq(users.email, 'admin@pbx.local')).limit(1),
  );

  const [row] = await withBypassRls(db.db, async (tx) =>
    tx
      .insert(platformApiTokens)
      .values({
        name,
        tokenPrefix: prefix,
        tokenHash,
        status: 'active',
        role: 'platform_super_admin',
        scopes: ['*'],
        createdByUserId: admin?.id ?? null,
        expiresAt,
        metadata: { source: 'create-platform-api-token.ts' },
      })
      .returning(),
  );

  console.log(
    JSON.stringify({
      id: row!.id,
      name: row!.name,
      tokenPrefix: row!.tokenPrefix,
      expiresAt: row!.expiresAt?.toISOString() ?? null,
      token,
    }),
  );

  if (process.env.PBX_WRITE_TOKEN_TO_ROOT_FILE === 'true') {
    const target = '/root/.pbx-platform-api-token';
    writeFileSync(target, `${token}\n`, { encoding: 'utf8', mode: 0o600 });
    chmodSync(target, 0o600);
    console.log(JSON.stringify({ writtenTo: target }));
  }
}

main().catch((err) => {
  console.error('create_platform_api_token_failed:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
