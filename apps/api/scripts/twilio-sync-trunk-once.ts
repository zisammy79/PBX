/**
 * Sync Twilio trunk termination credentials to Twilio + DB, then reprovision telephony.
 */
import 'reflect-metadata';
import { eq } from 'drizzle-orm';
import { createDatabase, sipTrunks, users, withBypassRls } from '@pbx/database';
import { encryptSecret } from '@pbx/shared';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module.js';
import { loadConfig, resolveDatabaseUrl } from '../src/config.js';
import { TelephonyService } from '../src/modules/telephony/telephony.service.js';
import { TwilioService } from '../src/modules/twilio/twilio.service.js';

const tenantId = process.argv[2] ?? '2433f849-3b43-405c-83a4-47d4ff492955';
const trunkSlug = 'twilio-production';

async function main() {
  const config = loadConfig();
  const db = createDatabase({ url: resolveDatabaseUrl(config) });
  const app = await NestFactory.createApplicationContext(AppModule.forRoot(config), {
    logger: ['error', 'warn'],
  });

  try {
    const twilio = app.get(TwilioService);
    const telephony = app.get(TelephonyService);
    const cfg = twilio.twilioConfig();

    if (!cfg.sipUsername || !cfg.sipPassword) {
      throw new Error('TWILIO_SIP_USERNAME and TWILIO_SIP_PASSWORD must be set');
    }

    const status = await twilio.syncTrunk();
    console.log('sync_trunk:', JSON.stringify(status));

    const credentialsEncrypted = encryptSecret(
      JSON.stringify({ username: cfg.sipUsername, password: cfg.sipPassword }),
      config.encryptionMasterKey,
    );

    await withBypassRls(db.db, async (tx) => {
      await tx
        .update(sipTrunks)
        .set({
          credentialsEncrypted,
          updatedAt: new Date(),
        })
        .where(eq(sipTrunks.slug, trunkSlug));
    });
    console.log('db_credentials_updated: true');

    const [userRow] = await db.db.select().from(users).where(eq(users.email, 'admin@pbx.local')).limit(1);
    if (!userRow) throw new Error('admin user not found');

    const actor = {
      id: userRow.id,
      email: userRow.email,
      platformRoles: userRow.platformRoles,
      tenantMemberships: [] as Array<{ tenantId: string; roles: string[] }>,
    };

    const provision = await telephony.provisionGlobalConfiguration(actor, tenantId);
    console.log('provision:', JSON.stringify(provision));
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error('sync_failed:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
