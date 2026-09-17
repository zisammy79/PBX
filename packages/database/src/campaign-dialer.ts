import {
  classifyDialAttempt,
  shouldCountAttempt,
  type CampaignDialOutcome,
  type CampaignTickResult,
} from '@pbx/shared';
import { and, asc, count, eq, inArray, isNull, lt, or } from 'drizzle-orm';
import { platformEvents } from './schema/api.js';
import { auditEvents } from './schema/audit.js';
import {
  campaignNumbers,
  campaigns,
  dncListNumbers,
  dncLists,
} from './schema/callflow.js';
import { sipTrunks } from './schema/telephony.js';
import type { Database } from './index.js';
import { withTenantContext } from './tenant-context.js';

type DbTx = Parameters<Parameters<typeof withTenantContext>[2]>[0];

async function loadDncNumberSet(db: DbTx, tenantId: string): Promise<Set<string>> {
  const rows = await db
    .select({ number: dncListNumbers.number })
    .from(dncListNumbers)
    .innerJoin(dncLists, eq(dncListNumbers.listId, dncLists.id))
    .where(and(eq(dncListNumbers.tenantId, tenantId), eq(dncLists.listType, 'dnc')));

  return new Set(rows.map((row) => row.number.replace(/\D/g, '')));
}

async function tenantHasActiveTrunk(db: DbTx, tenantId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: sipTrunks.id })
    .from(sipTrunks)
    .where(and(eq(sipTrunks.tenantId, tenantId), eq(sipTrunks.isActive, true)))
    .limit(1);
  return Boolean(row);
}

async function recordDialAttempt(
  db: DbTx,
  tenantId: string,
  actorUserId: string | null,
  campaignId: string,
  campaignNumberId: string,
  number: string,
  outcome: CampaignDialOutcome,
  attempts: number,
): Promise<void> {
  const payload = {
    campaignId,
    campaignNumberId,
    number,
    outcome,
    attempts,
  };

  await db.insert(auditEvents).values({
    tenantId,
    actorUserId,
    actorType: actorUserId ? 'user' : 'system',
    action: 'campaign.dial.attempt',
    resourceType: 'campaign_number',
    resourceId: campaignNumberId,
    metadata: payload,
  });

  await db.insert(platformEvents).values({
    tenantId,
    eventType: 'campaign.dial.attempt',
    payload,
  });
}

export async function runCampaignDialerTick(
  db: Database,
  tenantId: string,
  campaignId: string,
  actorUserId: string | null,
): Promise<CampaignTickResult> {
  return withTenantContext(db, tenantId, async (tx) => {
    const [campaign] = await tx
      .select()
      .from(campaigns)
      .where(and(eq(campaigns.tenantId, tenantId), eq(campaigns.id, campaignId)))
      .limit(1);
    if (!campaign) {
      throw new Error('campaign_not_found');
    }
    if (campaign.status !== 'running') {
      throw new Error('campaign_not_running');
    }
    if (campaign.technology !== 'voice') {
      throw new Error('campaign_not_voice');
    }

    const [inFlightRow] = await tx
      .select({ total: count() })
      .from(campaignNumbers)
      .where(
        and(
          eq(campaignNumbers.tenantId, tenantId),
          eq(campaignNumbers.campaignId, campaignId),
          eq(campaignNumbers.lastStatus, 'queued'),
        ),
      );
    const inFlight = Number(inFlightRow?.total ?? 0);
    const slots = Math.max(0, campaign.maxConcurrent - inFlight);
    if (slots === 0) {
      return { campaignId, processed: 0, inFlight, results: [] };
    }

    const dncNumbers = await loadDncNumberSet(tx, tenantId);
    const hasTrunk = await tenantHasActiveTrunk(tx, tenantId);

    const candidates = await tx
      .select()
      .from(campaignNumbers)
      .where(
        and(
          eq(campaignNumbers.tenantId, tenantId),
          eq(campaignNumbers.campaignId, campaignId),
          lt(campaignNumbers.attempts, campaign.maxAttempts),
          or(
            isNull(campaignNumbers.lastStatus),
            inArray(campaignNumbers.lastStatus, ['failed_no_trunk']),
          ),
        ),
      )
      .orderBy(asc(campaignNumbers.createdAt))
      .limit(slots);

    const results: CampaignTickResult['results'] = [];
    for (const row of candidates) {
      const outcome = classifyDialAttempt(row.number, dncNumbers, hasTrunk);
      const nextAttempts = row.attempts + (shouldCountAttempt(outcome) ? 1 : 0);

      await tx
        .update(campaignNumbers)
        .set({ lastStatus: outcome, attempts: nextAttempts })
        .where(and(eq(campaignNumbers.tenantId, tenantId), eq(campaignNumbers.id, row.id)));

      await recordDialAttempt(
        tx,
        tenantId,
        actorUserId,
        campaignId,
        row.id,
        row.number,
        outcome,
        nextAttempts,
      );

      results.push({
        id: row.id,
        number: row.number,
        outcome,
        attempts: nextAttempts,
      });
    }

    return {
      campaignId,
      processed: results.length,
      inFlight: inFlight + results.filter((r: (typeof results)[number]) => r.outcome === 'queued').length,
      results,
    };
  });
}
