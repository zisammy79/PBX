import { createDatabase, extensions, sipCredentials, tenants, withBypassRls } from '@pbx/database';
import { decryptSecret, encryptSecret, generateSipSecret } from '@pbx/shared';
import {
  activateStagingConfig,
  generateTelephonyConfig,
  isSipUsernameInActiveConfig,
  reloadAsterisk,
  validateGeneratedConfig,
  writeStagingConfig,
} from '../../packages/telephony-config/src/index.ts';
import { and, eq } from 'drizzle-orm';

const tenantSlug = process.env.TENANT_SLUG ?? 'demo-company';
const extensionNumber = process.env.EXTENSION_NUMBER ?? '1003';
const rotate = (process.env.ROTATE ?? 'true') === 'true';
const repoRoot = process.env.PBX_REPO_ROOT ?? process.cwd();
const key = process.env.ENCRYPTION_MASTER_KEY ?? '';
const dbUrl =
  process.env.DATABASE_URL ??
  'postgresql://pbx:pbx_dev_password@localhost:5433/pbx?sslmode=disable';

if (key.length !== 64) {
  console.error('reconcile-extension: ENCRYPTION_MASTER_KEY must be 64 hex chars');
  process.exit(1);
}

async function main() {
  const { db, close } = createDatabase({ url: dbUrl });

  try {
    await withBypassRls(db, async (admin) => {
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

    let decryptOk = true;
    try {
      decryptSecret(row.credential.secretEncrypted, key);
    } catch {
      decryptOk = false;
    }

    if (!decryptOk) {
      if (!rotate) {
        throw new Error('Credential unavailable; rerun with rotate enabled');
      }
      const secret = generateSipSecret();
      await admin
        .update(sipCredentials)
        .set({
          secretEncrypted: encryptSecret(secret, key),
          secretVersion: row.credential.secretVersion + 1,
          rotatedAt: new Date(),
        })
        .where(eq(sipCredentials.extensionId, row.extension.id));
      console.log(`reconcile-extension: rotated credential for ${row.credential.username}`);
      console.log(`reconcile-extension: username=${row.credential.username}`);
      console.log('reconcile-extension: password=<rotated — use API rotate-credential in normal operations>');
    }

    const tenantRows = await admin.select().from(tenants).where(eq(tenants.status, 'active'));
    const extensionRows = await admin
      .select({ extension: extensions, credential: sipCredentials, tenant: tenants })
      .from(extensions)
      .innerJoin(tenants, eq(extensions.tenantId, tenants.id))
      .innerJoin(sipCredentials, eq(sipCredentials.extensionId, extensions.id))
      .where(eq(extensions.status, 'active'));

    const extRecords = [];
    const skipped: string[] = [];
    for (const extRow of extensionRows) {
      try {
        extRecords.push({
          tenantId: extRow.extension.tenantId,
          tenantSlug: extRow.tenant.slug,
          asteriskContext: extRow.tenant.asteriskContext,
          extensionNumber: extRow.extension.extensionNumber,
          displayName: extRow.extension.displayName,
          asteriskEndpointId: extRow.extension.asteriskEndpointId,
          sipUsername: extRow.credential.username,
          sipSecret: decryptSecret(extRow.credential.secretEncrypted, key),
          status: extRow.extension.status as 'active' | 'disabled',
        });
      } catch {
        skipped.push(extRow.credential.username);
      }
    }

    const generated = generateTelephonyConfig(
      tenantRows.map((t) => ({
        tenantId: t.id,
        slug: t.slug,
        asteriskContext: t.asteriskContext,
        status: t.status,
      })),
      extRecords,
      [],
      `reconcile-${Date.now()}`,
    );

    const validation = validateGeneratedConfig(generated, { requireExtensions: true });
    if (!validation.valid) {
      throw new Error(validation.errors.join('; '));
    }

    await writeStagingConfig(repoRoot, generated);
    const activated = await activateStagingConfig(repoRoot);
    if (!activated.activated) {
      throw new Error(activated.error ?? 'Activation failed');
    }

    const ariUrl = process.env.ASTERISK_ARI_URL;
    const ariPassword = process.env.ASTERISK_ARI_PASSWORD;
    const ariUsername = process.env.ASTERISK_ARI_USERNAME ?? 'pbx_ari';
    if (ariUrl && ariPassword) {
      await reloadAsterisk({ ariUrl, ariUsername, ariPassword });
    }

    const ready = await isSipUsernameInActiveConfig(repoRoot, row.credential.username);
    console.log(`reconcile-extension: activated version ${activated.version}`);
    console.log(`reconcile-extension: skipped_credentials=${skipped.length}`);
    console.log(`reconcile-extension: runtime_ready=${ready} username=${row.credential.username}`);
    if (!ready) {
      process.exit(2);
    }
    });
  } finally {
    await close();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
