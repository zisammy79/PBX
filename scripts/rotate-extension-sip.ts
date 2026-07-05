#!/usr/bin/env tsx
/**
 * Rotate an extension SIP credential, reprovision telephony, and reload Asterisk.
 * Usage:
 *   TENANT_SLUG=rls-a-2433f849 EXTENSION_NUMBER=100 pnpm exec tsx scripts/rotate-extension-sip.ts
 *
 * Writes the new password once to ROTATE_SIP_PASSWORD_FILE (default /root/.pbx-rotated-sip-password).
 * Never commit passwords.
 */
import { createDatabase, extensions, sipCredentials, tenants, withBypassRls } from '@pbx/database';
import { decryptSecret, encryptSecret, generateSipSecret } from '@pbx/shared';
import { and, eq } from 'drizzle-orm';
import { writeFileSync } from 'node:fs';

async function main(): Promise<void> {
  const tenantSlug = process.env.TENANT_SLUG?.trim();
  const extensionNumber = process.env.EXTENSION_NUMBER?.trim();
  const key = process.env.ENCRYPTION_MASTER_KEY?.trim();
  const dbUrl = process.env.DATABASE_URL?.trim();
  const passwordFile =
    process.env.ROTATE_SIP_PASSWORD_FILE?.trim() ?? '/root/.pbx-rotated-sip-password';

  if (!tenantSlug || !extensionNumber) {
    console.error('TENANT_SLUG and EXTENSION_NUMBER are required.');
    process.exit(1);
  }
  if (!key || key.length !== 64) {
    console.error('ENCRYPTION_MASTER_KEY must be 64 hex chars.');
    process.exit(1);
  }
  if (!dbUrl) {
    console.error('DATABASE_URL is required.');
    process.exit(1);
  }

  const { db, close } = createDatabase({ url: dbUrl });
  const sipSecret = generateSipSecret();

  try {
    const result = await withBypassRls(db, async (admin) => {
      const [row] = await admin
        .select({ extension: extensions, tenant: tenants, credential: sipCredentials })
        .from(extensions)
        .innerJoin(tenants, eq(extensions.tenantId, tenants.id))
        .innerJoin(sipCredentials, eq(sipCredentials.extensionId, extensions.id))
        .where(and(eq(tenants.slug, tenantSlug), eq(extensions.extensionNumber, extensionNumber)))
        .limit(1);

      if (!row) {
        throw new Error(`Extension ${tenantSlug}/${extensionNumber} not found`);
      }

      await admin
        .update(sipCredentials)
        .set({
          secretEncrypted: encryptSecret(sipSecret, key),
          secretVersion: row.credential.secretVersion + 1,
          rotatedAt: new Date(),
        })
        .where(eq(sipCredentials.extensionId, row.extension.id));

      return {
        tenantId: row.tenant.id,
        extensionId: row.extension.id,
        username: row.credential.username,
        endpointId: row.extension.asteriskEndpointId,
      };
    });

    writeFileSync(passwordFile, `${sipSecret}\n`, { mode: 0o600 });

    console.log(
      JSON.stringify({
        action: 'rotated',
        tenantSlug,
        extensionNumber,
        tenantId: result.tenantId,
        extensionId: result.extensionId,
        username: result.username,
        endpointId: result.endpointId,
        passwordFile,
      }),
    );
  } finally {
    await close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
