import {
  createDatabase,
  withBypassRls,
  tenants,
  extensions,
  tenantMemberships,
  users,
  sipCredentials,
  sipDevices,
  tenantInvitations,
} from './index.js';
import {
  encryptSecret,
  generateSecureToken,
  hashPassword,
  sha256Hex,
  tenantAsteriskContext,
} from '@pbx/shared';
import { and, eq } from 'drizzle-orm';

const db = createDatabase({ url: process.env.DATABASE_URL! });
const encryptionKey =
  process.env.CREDENTIAL_ENCRYPTION_KEY ?? process.env.ENCRYPTION_MASTER_KEY ?? process.env.APP_SECRET ?? 'dev-only-key';

async function ensureExtensionWithLegacyDevice(
  tx: Parameters<Parameters<typeof withBypassRls>[1]>[0],
  tenantId: string,
  slug: string,
  extensionNumber: string,
  recordingPolicyMode: 'inherit' | 'on' | 'off',
) {
  const [existing] = await tx
    .select()
    .from(extensions)
    .where(and(eq(extensions.tenantId, tenantId), eq(extensions.extensionNumber, extensionNumber)))
    .limit(1);
  if (existing) return;

  const endpointId = `${slug}_ext_${extensionNumber}`;
  const username = `${slug}_${extensionNumber}`;
  const secret = generateSecureToken(20);

  const [ext] = await tx
    .insert(extensions)
    .values({
      tenantId,
      extensionNumber,
      displayName: `${slug} ext ${extensionNumber}`,
      status: 'active',
      asteriskEndpointId: endpointId,
      recordingPolicyMode,
    })
    .returning();

  const [cred] = await tx
    .insert(sipCredentials)
    .values({
      tenantId,
      extensionId: ext!.id,
      username,
      secretEncrypted: encryptSecret(secret, encryptionKey),
    })
    .returning();

  await tx.insert(sipDevices).values({
    tenantId,
    extensionId: ext!.id,
    sipCredentialId: cred!.id,
    deviceType: 'legacy',
    friendlyName: 'Default device',
    status: 'ready',
    provisioningStatus: 'ready',
    asteriskEndpointId: endpointId,
  });
}

async function main() {
  await withBypassRls(db.db, async (tx) => {
    for (let i = 1; i <= 5; i += 1) {
      const slug = `demo-mt-${i}`;
      const [existing] = await tx.select().from(tenants).where(eq(tenants.slug, slug)).limit(1);
      let tenant = existing;

      if (!tenant) {
        const ownerEmail = `owner-${slug}@demo.local`;
        const [owner] = await tx
          .insert(users)
          .values({
            email: ownerEmail,
            displayName: `Owner ${i}`,
            passwordHash: hashPassword(generateSecureToken(16)),
            status: 'active',
            passwordMustChange: true,
          })
          .returning();

        const [created] = await tx
          .insert(tenants)
          .values({
            name: `Demo MT ${i}`,
            slug,
            status: 'active',
            asteriskContext: tenantAsteriskContext(slug),
          })
          .returning();

        tenant = created!;
        await tx.insert(tenantMemberships).values({
          tenantId: tenant.id,
          userId: owner!.id,
          roles: ['tenant_owner'],
          status: 'active',
          acceptedAt: new Date(),
        });

        console.log(`created tenant ${slug} (owner ${ownerEmail}, password generated — not logged)`);
      } else {
        console.log(`reuse tenant ${slug}`);
      }

      for (let u = 1; u <= 4; u += 1) {
        const email = `user${u}-${slug}@demo.local`;
        const [user] = await tx.select().from(users).where(eq(users.email, email)).limit(1);
        if (!user) {
          const [createdUser] = await tx
            .insert(users)
            .values({
              email,
              displayName: `User ${u} ${slug}`,
              passwordHash: hashPassword(generateSecureToken(16)),
              status: 'active',
            })
            .returning();
          await tx.insert(tenantMemberships).values({
            tenantId: tenant!.id,
            userId: createdUser!.id,
            roles: u === 1 ? ['tenant_administrator'] : ['human_agent'],
            status: 'active',
            acceptedAt: new Date(),
          });
        }
      }

      for (let ext = 1; ext <= 5; ext += 1) {
        const number = String(1000 + ext);
        await ensureExtensionWithLegacyDevice(
          tx,
          tenant!.id,
          slug,
          number,
          ext % 2 === 0 ? 'inherit' : 'on',
        );
      }

      const inviteEmail = `pending-${slug}@demo.local`;
      const [pendingInvite] = await tx
        .select()
        .from(tenantInvitations)
        .where(and(eq(tenantInvitations.tenantId, tenant!.id), eq(tenantInvitations.email, inviteEmail)))
        .limit(1);
      if (!pendingInvite) {
        const token = generateSecureToken(32);
        await tx.insert(tenantInvitations).values({
          tenantId: tenant!.id,
          email: inviteEmail,
          role: 'human_agent',
          tokenHash: sha256Hex(token),
          status: 'pending',
          deliveryStatus: 'provider_not_configured',
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        });
      }
    }
  });
}

main()
  .then(async () => {
    await db.close();
  })
  .catch(async (err) => {
    console.error(err);
    await db.close();
    process.exit(1);
  });
