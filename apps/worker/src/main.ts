import { connect, StringCodec } from 'nats';
import { TELEPHONY_EVENT_MAP, WebhookEventEnvelopeSchema } from '@pbx/contracts';
import {
  createDatabase,
  withBypassRls,
} from '@pbx/database';
import {
  platformEvents,
  webhookDeliveries,
  webhookEndpoints,
} from '@pbx/database/schema/api';
import { eq } from 'drizzle-orm';
import { processPendingDeliveries } from './webhook-deliverer.js';

const sc = StringCodec();

function loadConfig() {
  const databaseUrl = process.env.DATABASE_URL ?? process.env.DATABASE_APP_URL;
  const encryptionMasterKey = process.env.ENCRYPTION_MASTER_KEY;
  const natsUrl = process.env.NATS_URL ?? 'nats://localhost:4222';
  if (!databaseUrl || !encryptionMasterKey) {
    throw new Error('DATABASE_URL and ENCRYPTION_MASTER_KEY are required');
  }
  return {
    databaseUrl,
    encryptionMasterKey,
    natsUrl,
    pollIntervalMs: Number(process.env.WORKER_POLL_INTERVAL_MS ?? 5000),
  };
}

async function handleCallEvent(raw: string, db: ReturnType<typeof createDatabase>['db']) {
  const parsed = JSON.parse(raw) as {
    tenantId: string;
    callId: string;
    correlationId: string;
    eventType: string;
    occurredAt: string;
    payload: Record<string, unknown>;
  };

  const mapped = TELEPHONY_EVENT_MAP[parsed.eventType];
  if (!mapped) return;

  await withBypassRls(db, async (tx) => {
    const [event] = await tx
      .insert(platformEvents)
      .values({
        tenantId: parsed.tenantId,
        eventType: mapped,
        correlationId: parsed.correlationId,
        payload: {
          callId: parsed.callId,
          ...parsed.payload,
        },
      })
      .returning();

    const envelope = WebhookEventEnvelopeSchema.parse({
      id: event!.id,
      type: mapped,
      apiVersion: 'v1',
      tenantId: parsed.tenantId,
      createdAt: event!.createdAt.toISOString(),
      correlationId: parsed.correlationId,
      data: {
        callId: parsed.callId,
        ...parsed.payload,
      },
    });

    const endpoints = await tx
      .select()
      .from(webhookEndpoints)
      .where(eq(webhookEndpoints.tenantId, parsed.tenantId));

    for (const endpoint of endpoints) {
      if (!endpoint.isActive || !endpoint.eventTypes.includes(mapped)) continue;
      await tx
        .insert(webhookDeliveries)
        .values({
          tenantId: parsed.tenantId,
          endpointId: endpoint.id,
          eventId: event!.id,
          eventType: mapped,
          payload: envelope,
          status: 'pending',
          nextAttemptAt: new Date(),
          correlationId: parsed.correlationId,
          secretVersion: endpoint.secretVersion,
        })
        .onConflictDoNothing();
    }
  });
}

async function main() {
  const config = loadConfig();
  console.log('PBX worker starting — webhook delivery + NATS call events');

  const database = createDatabase({
    url: config.databaseUrl,
    maxConnections: Number(process.env.DATABASE_MAX_CONNECTIONS ?? 3),
  });
  const db = database.db;

  const shutdown = async () => {
    await database.close().catch(() => undefined);
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());

  const nc = await connect({ servers: config.natsUrl });
  const sub = nc.subscribe('tenant.*.calls.events');

  void (async () => {
    for await (const msg of sub) {
      try {
        await handleCallEvent(sc.decode(msg.data), db);
      } catch (err) {
        console.error('Failed to process call event:', err);
      }
    }
  })();

  const tick = async () => {
    try {
      const count = await processPendingDeliveries(config, db);
      if (count > 0) {
        console.log(`Processed webhook delivery batch (${count} candidates)`);
      }
    } catch (err) {
      console.error('Webhook delivery tick failed:', err);
    }
  };

  await tick();
  setInterval(tick, config.pollIntervalMs);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
