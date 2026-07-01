/**
 * Twilio trunk termination diagnostics (no secrets printed).
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module.js';
import { loadConfig } from '../src/config.js';
import { TwilioService } from '../src/modules/twilio/twilio.service.js';

async function main() {
  const config = loadConfig();
  const app = await NestFactory.createApplicationContext(AppModule.forRoot(config), {
    logger: ['error', 'warn'],
  });

  try {
    const twilio = app.get(TwilioService);
    if (!twilio.isConfigured()) {
      throw new Error('Twilio is not configured');
    }

    const status = await twilio.getTrunkStatus();
    console.log('trunk_status:', JSON.stringify(status, null, 2));

    const cfg = twilio.twilioConfig();
    const client = twilio.createClient();
    const attachedCredLists = await client.trunking.v1.trunks(cfg.trunkSid).credentialsLists.list();
    console.log('credential_lists_attached:', attachedCredLists.length);
    for (const row of attachedCredLists) {
      const creds = await client.sip.credentialLists(row.sid).credentials.list();
      console.log(
        'credential_list:',
        JSON.stringify({
          sid: row.sid,
          credentialCount: creds.length,
          usernames: creds.map((c) => c.username),
        }),
      );
    }

    const envTermHost = (cfg.terminationSipUri || '').replace(/^sip:/i, '').split(':')[0];
    const apiTermHost = (status.terminationSipUri || '').replace(/^sip:/i, '').split(':')[0];
    console.log(
      'termination_hosts:',
      JSON.stringify({
        env: envTermHost,
        api: apiTermHost,
        match: envTermHost === apiTermHost,
      }),
    );
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error('diagnose_failed:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
