#!/usr/bin/env tsx
/**
 * Production-safe platform admin password reset.
 * Usage:
 *   PBX_ADMIN_EMAIL=admin@pbx.local PBX_ADMIN_NEW_PASSWORD='...' pnpm tsx scripts/reset-platform-admin-password.ts
 *
 * Never commit passwords. Logs only non-secret metadata.
 */
import { hashPassword } from '@pbx/shared';
import postgres from 'postgres';

async function main(): Promise<void> {
  const email = (process.env.PBX_ADMIN_EMAIL ?? 'admin@pbx.local').trim().toLowerCase();
  const newPassword = process.env.PBX_ADMIN_NEW_PASSWORD?.trim();

  if (!newPassword || newPassword.length < 12) {
    console.error('PBX_ADMIN_NEW_PASSWORD must be set and at least 12 characters.');
    process.exit(1);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL is required.');
    process.exit(1);
  }

  const sql = postgres(databaseUrl, { max: 1 });

  try {
    const passwordHash = hashPassword(newPassword);
    const updated = await sql`
      UPDATE users
      SET
        password_hash = ${passwordHash},
        password_must_change = false,
        status = 'active',
        platform_roles = ARRAY['platform_super_admin']::text[],
        updated_at = NOW()
      WHERE email = ${email}
      RETURNING id, email, status, platform_roles, updated_at
    `;

    if (!updated[0]) {
      const inserted = await sql`
        INSERT INTO users (email, password_hash, status, platform_roles, password_must_change)
        VALUES (
          ${email},
          ${passwordHash},
          'active',
          ARRAY['platform_super_admin']::text[],
          false
        )
        RETURNING id, email, status, platform_roles, updated_at
      `;
      const row = inserted[0];
      if (!row) {
        console.error('Failed to create platform admin user.');
        process.exit(1);
      }
      console.log(
        JSON.stringify({
          action: 'created',
          userId: row.id,
          email: row.email,
          status: row.status,
          platformRoles: row.platform_roles,
          updatedAt: row.updated_at,
        }),
      );
      return;
    }

    const row = updated[0];
    console.log(
      JSON.stringify({
        action: 'updated',
        userId: row.id,
        email: row.email,
        status: row.status,
        platformRoles: row.platform_roles,
        updatedAt: row.updated_at,
      }),
    );
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
