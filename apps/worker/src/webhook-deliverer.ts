import { decryptSecret, redactSecrets } from '@pbx/shared';
import {
  WEBHOOK_ATTEMPT_HEADER,
  WEBHOOK_ID_HEADER,
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_TIMESTAMP_HEADER,
  signWebhookBody,
} from '@pbx/shared';
import { MAX_WEBHOOK_ATTEMPTS, WEBHOOK_RETRY_DELAYS_MS } from '@pbx/contracts';
import { and, eq, inArray, lte, or, sql } from 'drizzle-orm';
import {
  createDatabase,
  withBypassRls,
} from '@pbx/database';
import { webhookDeliveries, webhookEndpoints } from '@pbx/database/schema/api';

/** Pure helper for webhook retry / terminal state decisions (worker restart safe). */
export function resolveFailureOutcome(
  attempt: number,
  errorCategory: string | null,
  maxAttempts: number,
): 'dead_letter' | 'failed' {
  const permanent = errorCategory === 'client_error';
  const exhausted = attempt >= maxAttempts;
  return permanent || exhausted ? 'dead_letter' : 'failed';
}

export function isTerminalDeliveryStatus(status: string): boolean {
  return status === 'delivered' || status === 'dead_letter';
}

const MAX_RESPONSE_BYTES = 4096;
const CONNECT_TIMEOUT_MS = 10_000;
const TOTAL_TIMEOUT_MS = 30_000;

type WorkerConfig = {
  databaseUrl: string;
  encryptionMasterKey: string;
  pollIntervalMs: number;
};

export async function processPendingDeliveries(config: WorkerConfig): Promise<number> {
  const { db } = createDatabase({ url: config.databaseUrl });
  const now = new Date();

  const pending = await withBypassRls(db, async (tx) =>
    tx
      .select()
      .from(webhookDeliveries)
      .where(
        and(
          inArray(webhookDeliveries.status, ['pending', 'failed']),
          or(sql`${webhookDeliveries.nextAttemptAt} IS NULL`, lte(webhookDeliveries.nextAttemptAt, now)),
        ),
      )
      .limit(25),
  );

  for (const delivery of pending) {
    await deliverOne(db, config, delivery.id);
  }

  return pending.length;
}

async function deliverOne(
  db: ReturnType<typeof createDatabase>['db'],
  config: WorkerConfig,
  deliveryId: string,
) {
  await withBypassRls(db, async (tx) => {
    const [delivery] = await tx
      .select()
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.id, deliveryId))
      .limit(1);
    if (!delivery || isTerminalDeliveryStatus(delivery.status)) return;

    const [endpoint] = await tx
      .select()
      .from(webhookEndpoints)
      .where(eq(webhookEndpoints.id, delivery.endpointId))
      .limit(1);
    if (!endpoint || !endpoint.isActive) {
      await tx
        .update(webhookDeliveries)
        .set({ status: 'dead_letter', errorCategory: 'endpoint_disabled' })
        .where(eq(webhookDeliveries.id, deliveryId));
      return;
    }

    const attempt = delivery.attemptCount + 1;
    const rawBody = JSON.stringify(delivery.payload);
    const timestamp = Math.floor(Date.now() / 1000);
    const secret = decryptSecret(endpoint.secretEncrypted, config.encryptionMasterKey);
    const signature = signWebhookBody(secret, timestamp, rawBody);

    const started = Date.now();
    let responseStatus: number | null = null;
    let responseBody = '';
    let errorCategory: string | null = null;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TOTAL_TIMEOUT_MS);
      const res = await fetch(endpoint.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [WEBHOOK_ID_HEADER]: delivery.id,
          [WEBHOOK_TIMESTAMP_HEADER]: String(timestamp),
          [WEBHOOK_SIGNATURE_HEADER]: signature,
          [WEBHOOK_ATTEMPT_HEADER]: String(attempt),
        },
        body: rawBody,
        signal: controller.signal,
        redirect: 'manual',
      });
      clearTimeout(timer);

      if (res.status >= 300 && res.status < 400) {
        throw new Error('redirect_not_allowed');
      }

      responseStatus = res.status;
      const text = await res.text();
      responseBody = redactSecrets(text.slice(0, MAX_RESPONSE_BYTES));

      if (res.ok) {
        await tx
          .update(webhookDeliveries)
          .set({
            status: 'delivered',
            attemptCount: attempt,
            lastAttemptAt: new Date(),
            responseStatus,
            responseBody,
            durationMs: Date.now() - started,
            errorCategory: null,
            nextAttemptAt: null,
          })
          .where(eq(webhookDeliveries.id, deliveryId));

        await tx
          .update(webhookEndpoints)
          .set({
            lastSuccessfulDeliveryAt: new Date(),
            failureCount: 0,
            updatedAt: new Date(),
          })
          .where(eq(webhookEndpoints.id, endpoint.id));
        return;
      }

      errorCategory = res.status >= 500 ? 'server_error' : 'client_error';
    } catch (err) {
      errorCategory = err instanceof Error && err.name === 'AbortError' ? 'timeout' : 'network_error';
      responseBody = redactSecrets(String(err).slice(0, MAX_RESPONSE_BYTES));
    }

    const permanent = errorCategory === 'client_error';
    const exhausted = attempt >= MAX_WEBHOOK_ATTEMPTS;
    const delayMs = WEBHOOK_RETRY_DELAYS_MS[Math.min(attempt, WEBHOOK_RETRY_DELAYS_MS.length - 1)] ?? 0;
    const nextAttemptAt = permanent || exhausted ? null : new Date(Date.now() + delayMs);
    const failureStatus = resolveFailureOutcome(attempt, errorCategory, MAX_WEBHOOK_ATTEMPTS);

    await tx
      .update(webhookDeliveries)
      .set({
        status: failureStatus,
        attemptCount: attempt,
        lastAttemptAt: new Date(),
        nextAttemptAt,
        responseStatus,
        responseBody,
        durationMs: Date.now() - started,
        errorCategory,
      })
      .where(eq(webhookDeliveries.id, deliveryId));

    await tx
      .update(webhookEndpoints)
      .set({
        lastFailedDeliveryAt: new Date(),
        failureCount: sql`${webhookEndpoints.failureCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(webhookEndpoints.id, endpoint.id));
  });
}
