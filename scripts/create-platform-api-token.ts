/**
 * Create a platform_super_admin automation API token (plaintext shown once).
 *
 * Usage:
 *   PBX_PLATFORM_TOKEN_NAME="production-automation" \
 *   DATABASE_URL=... pnpm exec tsx scripts/create-platform-api-token.ts
 *
 * Optional:
 *   PBX_WRITE_TOKEN_TO_ROOT_FILE=true  -> writes token to /root/.pbx-platform-api-token (mode 600)
 */
import { chmodSync, writeFileSync } from 'node:fs';
import {
  formatPlatformApiToken,
  generatePlatformApiTokenPrefix,
  generatePlatformApiTokenSecret,
  hashPlatformApiTokenSecret,
} from '@pbx/shared';
import postgres from 'postgres';

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

  const prefix = generatePlatformApiTokenPrefix();
  const secret = generatePlatformApiTokenSecret();
  const token = formatPlatformApiToken(prefix, secret);
  const tokenHash = hashPlatformApiTokenSecret(secret);

  const sql = postgres(resolveDatabaseUrl(), { max: 1 });
  try {
    const [admin] = await sql`
      SELECT id FROM users WHERE email = 'admin@pbx.local' LIMIT 1
    `;

    const [row] = await sql`
      INSERT INTO platform_api_tokens (
        name,
        token_prefix,
        token_hash,
        status,
        role,
        scopes,
        created_by_user_id,
        expires_at,
        metadata
      )
      VALUES (
        ${name},
        ${prefix},
        ${tokenHash},
        'active',
        'platform_super_admin',
        '["*"]'::jsonb,
        ${admin?.id ?? null},
        ${expiresAt},
        ${JSON.stringify({ source: 'create-platform-api-token.ts' })}::jsonb
      )
      RETURNING id, name, token_prefix, expires_at
    `;

    if (!row) {
      throw new Error('Failed to create platform API token');
    }

    console.log(
      JSON.stringify({
        id: row.id,
        name: row.name,
        tokenPrefix: row.token_prefix,
        expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
        token,
      }),
    );

    if (process.env.PBX_WRITE_TOKEN_TO_ROOT_FILE === 'true') {
      const target = '/root/.pbx-platform-api-token';
      writeFileSync(target, `${token}\n`, { encoding: 'utf8', mode: 0o600 });
      chmodSync(target, 0o600);
      console.log(JSON.stringify({ writtenTo: target }));
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error('create_platform_api_token_failed:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
