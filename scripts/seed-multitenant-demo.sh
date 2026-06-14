#!/usr/bin/env bash
# Idempotent demo seed: 5 customer tenants × 5 extensions (25 total). No passwords logged.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ "${ALLOW_DEV_SEED:-}" != "true" ]]; then
  echo "Set ALLOW_DEV_SEED=true to run multitenant demo seed"
  exit 1
fi

set -a
source .env
set +a

npx --yes pnpm db:migrate

node --import tsx <<'NODE'
import { createDatabase, withBypassRls, tenants, extensions, tenantMemberships, users } from '@pbx/database';
import { hashPassword, tenantAsteriskContext, generateSecureToken } from '@pbx/shared';
import { eq } from 'drizzle-orm';

const db = createDatabase(process.env.DATABASE_URL!);

async function main() {
  await withBypassRls(db.db, async (tx) => {
    for (let i = 1; i <= 5; i += 1) {
      const slug = `demo-mt-${i}`;
      const [existing] = await tx.select().from(tenants).where(eq(tenants.slug, slug)).limit(1);
      if (existing) {
        console.log(`skip existing tenant ${slug}`);
        continue;
      }

      const ownerEmail = `owner-${slug}@demo.local`;
      const tempPassword = generateSecureToken(16);
      const [owner] = await tx
        .insert(users)
        .values({
          email: ownerEmail,
          displayName: `Owner ${i}`,
          passwordHash: hashPassword(tempPassword),
          status: 'active',
          passwordMustChange: true,
        })
        .returning();

      const [tenant] = await tx
        .insert(tenants)
        .values({
          name: `Demo MT ${i}`,
          slug,
          status: 'active',
          asteriskContext: tenantAsteriskContext(slug),
        })
        .returning();

      await tx.insert(tenantMemberships).values({
        tenantId: tenant!.id,
        userId: owner!.id,
        roles: ['tenant_owner'],
      });

      for (let ext = 1; ext <= 5; ext += 1) {
        const number = String(1000 + ext);
        await tx.insert(extensions).values({
          tenantId: tenant!.id,
          extensionNumber: number,
          displayName: `${slug} ext ${number}`,
          status: 'active',
          asteriskEndpointId: `${slug}_ext_${number}`,
          recordingPolicyMode: ext % 2 === 0 ? 'inherit' : 'on',
        });
      }

      console.log(`created tenant ${slug} (owner ${ownerEmail}, temp password generated — not logged)`);
    }
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
NODE

echo "MULTITENANT_DEMO_SEED: PASS"
