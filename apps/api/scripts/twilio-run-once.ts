/**
 * One-shot Twilio activation on production (no HTTP auth). Never logs secrets.
 */
import 'reflect-metadata';
import { eq, and } from 'drizzle-orm';
import { NestFactory } from '@nestjs/core';
import { verifyPassword } from '@pbx/shared';
import { createDatabase, extensions, users, withBypassRls } from '@pbx/database';
import { AppModule } from '../src/app.module.js';
import { loadConfig, resolveDatabaseUrl } from '../src/config.js';
import { TwilioService } from '../src/modules/twilio/twilio.service.js';
import { TwilioProvisioningService } from '../src/modules/twilio/twilio-provisioning.service.js';

const tenantId = process.argv[2] ?? '2433f849-3b43-405c-83a4-47d4ff492955';
const extensionNumber = process.argv[3] ?? '100';

async function main() {
  console.log('step: loadConfig');
  const config = loadConfig();
  console.log('step: createDatabase');
  const db = createDatabase({ url: resolveDatabaseUrl(config) });

  console.log('step: query admin');
  const [userRow] = await db.db.select().from(users).where(eq(users.email, 'admin@pbx.local')).limit(1);
  if (!userRow) throw new Error('admin user not found');

  const pass = process.env.DEV_ADMIN_PASSWORD ?? '';
  const passwordOk = pass ? verifyPassword(pass, userRow.passwordHash) : false;
  console.log('admin_password_match:', passwordOk);

  console.log('step: nest bootstrap');
  const app = await NestFactory.createApplicationContext(AppModule.forRoot(config), {
    logger: ['error', 'warn'],
  });

  try {
    const twilio = app.get(TwilioService);
    const provisioning = app.get(TwilioProvisioningService);

    if (!twilio.isConfigured()) {
      throw new Error('Twilio is not configured');
    }

    const validate = await twilio.validateCredentials();
    console.log('validate:', JSON.stringify({ ok: validate.ok, accountSid: validate.accountSid }));

    const trunkBefore = await twilio.getTrunkStatus();
    console.log(
      'trunk_before:',
      JSON.stringify({
        originationUriMatches: trunkBefore.originationUriMatches,
        ipAclContainsPbx: trunkBefore.ipAclContainsPbx,
        attachedNumberCount: trunkBefore.attachedNumberCount,
      }),
    );

    const sync = await twilio.syncTrunk();
    console.log(
      'trunk_sync:',
      JSON.stringify({
        originationUriMatches: sync.originationUriMatches,
        ipAclContainsPbx: sync.ipAclContainsPbx,
        attachedNumberCount: sync.attachedNumberCount,
      }),
    );

    const actor = {
      id: userRow.id,
      email: userRow.email,
      platformRoles: userRow.platformRoles,
      tenantMemberships: [] as Array<{ tenantId: string; roles: string[] }>,
    };

    const existingExt = await withBypassRls(db.db, async (tx) =>
      tx
        .select()
        .from(extensions)
        .where(and(eq(extensions.tenantId, tenantId), eq(extensions.extensionNumber, extensionNumber)))
        .limit(1),
    );

    if (!existingExt[0]) {
      const { ExtensionsService } = await import('../src/modules/extensions/extensions.service.js');
      const extensionsService = app.get(ExtensionsService);
      await extensionsService.createExtension(actor, tenantId, {
        extensionNumber,
        displayName: 'Twilio Test',
      });
      console.log('extension_100: created');
    } else {
      console.log('extension_100: exists');
    }

    const result = await provisioning.provisionPhoneNumberForTenant(actor, tenantId, {
      inboundDestinationExtensionNumber: extensionNumber,
    });
    const e164 = result.e164 ?? '';
    const masked = e164.length > 6 ? `${e164.slice(0, 4)}****${e164.slice(-2)}` : '****';
    console.log('assign:', JSON.stringify({ status: result.status, e164: masked, tenantId }));
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  if (err && typeof err === 'object') {
    const e = err as { message?: string; code?: string; details?: unknown; stack?: string };
    console.error('activation_failed:', e.message || e.code || 'unknown');
    if (e.details) console.error('details:', JSON.stringify(e.details));
    if (e.stack) console.error(e.stack.split('\n').slice(0, 8).join('\n'));
  } else {
    console.error('activation_failed:', String(err));
  }
  process.exit(1);
});
