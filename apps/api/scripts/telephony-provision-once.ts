/**
 * Regenerate and activate global telephony config (production one-shot).
 */
import 'reflect-metadata';
import { and, eq } from 'drizzle-orm';
import { NestFactory } from '@nestjs/core';
import { createDatabase, extensions, users, withBypassRls } from '@pbx/database';
import { isSipUsernameInActiveConfig } from '@pbx/telephony-config';
import { AppModule } from '../src/app.module.js';
import { loadConfig, resolveDatabaseUrl } from '../src/config.js';
import { TelephonyService } from '../src/modules/telephony/telephony.service.js';

const tenantId = process.argv[2] ?? '2433f849-3b43-405c-83a4-47d4ff492955';
const extensionNumber = process.argv[3] ?? '100';
const sipUsername = process.argv[4] ?? 'rls-a-2433f849_100';

async function main() {
  const config = loadConfig();
  console.log('repo_root:', config.repoRoot);
  console.log('sip_public_domain:', config.sipPublicDomain);

  const db = createDatabase({ url: resolveDatabaseUrl(config) });
  const [userRow] = await db.db.select().from(users).where(eq(users.email, 'admin@pbx.local')).limit(1);
  if (!userRow) throw new Error('admin user not found');

  const [extRow] = await withBypassRls(db.db, async (tx) =>
    tx
      .select()
      .from(extensions)
      .where(and(eq(extensions.tenantId, tenantId), eq(extensions.extensionNumber, extensionNumber)))
      .limit(1),
  );
  if (!extRow) throw new Error(`extension ${extensionNumber} not found`);

  const app = await NestFactory.createApplicationContext(AppModule.forRoot(config), {
    logger: ['error', 'warn'],
  });

  try {
    const telephony = app.get(TelephonyService);
    const actor = {
      id: userRow.id,
      email: userRow.email,
      platformRoles: userRow.platformRoles,
      tenantMemberships: [] as Array<{ tenantId: string; roles: string[] }>,
    };

    const result = await telephony.provisionGlobalConfiguration(actor, tenantId);
    console.log('provision:', JSON.stringify(result));

    const state = await telephony.getExtensionProvisioningState(tenantId, extRow.id);
    console.log('provisioning_state:', JSON.stringify(state));

    const ready = await isSipUsernameInActiveConfig(config.repoRoot ?? '/opt/pbx', sipUsername);
    console.log('runtime_ready:', ready, 'username:', sipUsername);
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error('provision_failed:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
