import { createDatabase, withBypassRls, extensions, sipCredentials, sipDevices } from './index.js';
import { and, eq } from 'drizzle-orm';

const db = createDatabase({ url: process.env.DATABASE_URL! });

async function main() {
  let created = 0;
  await withBypassRls(db.db, async (tx) => {
    const rows = await tx
      .select({ extension: extensions, credential: sipCredentials })
      .from(extensions)
      .innerJoin(sipCredentials, eq(sipCredentials.extensionId, extensions.id))
      .where(eq(extensions.status, 'active'));

    for (const row of rows) {
      const [existing] = await tx
        .select()
        .from(sipDevices)
        .where(and(eq(sipDevices.extensionId, row.extension.id), eq(sipDevices.deviceType, 'legacy')))
        .limit(1);
      if (existing) continue;

      await tx.insert(sipDevices).values({
        tenantId: row.extension.tenantId,
        extensionId: row.extension.id,
        sipCredentialId: row.credential.id,
        deviceType: 'legacy',
        friendlyName: 'Default device',
        status: 'ready',
        provisioningStatus: 'ready',
        asteriskEndpointId: row.extension.asteriskEndpointId,
      });
      created += 1;
    }
  });
  console.log(`LEGACY_DEVICE_BACKFILL: created=${created}`);
  await db.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
