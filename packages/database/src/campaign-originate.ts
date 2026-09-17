import { and, eq } from 'drizzle-orm';
import { platformEvents } from './schema/api.js';
import { auditEvents } from './schema/audit.js';
import { sipTrunks } from './schema/telephony.js';
import type { Database } from './index.js';
import { withTenantContext } from './tenant-context.js';

export type CampaignOriginateNumber = {
  id: string;
  number: string;
};

export type CampaignOriginateResult = {
  attempted: number;
  deferred: number;
};

async function tenantHasActiveTrunk(
  db: Parameters<Parameters<typeof withTenantContext>[2]>[0],
  tenantId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: sipTrunks.id })
    .from(sipTrunks)
    .where(and(eq(sipTrunks.tenantId, tenantId), eq(sipTrunks.isActive, true)))
    .limit(1);
  return Boolean(row);
}

async function recordDeferredOriginate(
  db: Parameters<Parameters<typeof withTenantContext>[2]>[0],
  tenantId: string,
  actorUserId: string | null,
  campaignId: string,
  number: CampaignOriginateNumber,
  reason: string,
): Promise<void> {
  const payload = {
    campaignId,
    campaignNumberId: number.id,
    number: number.number,
    reason,
  };

  await db.insert(auditEvents).values({
    tenantId,
    actorUserId,
    actorType: 'system',
    action: 'campaign.dial.deferred_no_originate',
    resourceType: 'campaign_number',
    resourceId: number.id,
    metadata: payload,
  });

  await db.insert(platformEvents).values({
    tenantId,
    eventType: 'campaign.dial.deferred_no_originate',
    payload,
  });
}

export async function attemptCampaignOriginate(
  db: Database,
  options: {
    tenantId: string;
    campaignId: string;
    numbers: CampaignOriginateNumber[];
    originateEnabled: boolean;
    actorUserId: string | null;
  },
): Promise<CampaignOriginateResult> {
  if (options.numbers.length === 0) {
    return { attempted: 0, deferred: 0 };
  }

  return withTenantContext(db, options.tenantId, async (tx) => {
    const hasTrunk = await tenantHasActiveTrunk(tx, options.tenantId);
    let attempted = 0;
    let deferred = 0;

    for (const number of options.numbers) {
      if (!options.originateEnabled || !hasTrunk) {
        await recordDeferredOriginate(
          tx,
          options.tenantId,
          options.actorUserId,
          options.campaignId,
          number,
          !options.originateEnabled ? 'originate_disabled' : 'no_trunk',
        );
        deferred++;
        continue;
      }

      // Runtime stub: ARI / telephony-controller originate wiring lands in a later slice.
      await recordDeferredOriginate(
        tx,
        options.tenantId,
        options.actorUserId,
        options.campaignId,
        number,
        'originate_not_implemented',
      );
      deferred++;
    }

    return { attempted, deferred };
  });
}
