import { and, eq } from 'drizzle-orm';
import {
  attemptCampaignOriginate,
  campaigns,
  runCampaignDialerTick,
  withBypassRls,
  type Database,
} from '@pbx/database';

export type RunningVoiceCampaign = {
  tenantId: string;
  campaignId: string;
};

export async function listRunningVoiceCampaigns(db: Database): Promise<RunningVoiceCampaign[]> {
  return withBypassRls(db, async (tx) => {
    const rows = await tx
      .select({ tenantId: campaigns.tenantId, campaignId: campaigns.id })
      .from(campaigns)
      .where(and(eq(campaigns.status, 'running'), eq(campaigns.technology, 'voice')));
    return rows;
  });
}

export type CampaignCronResult = {
  campaigns: number;
  ticks: number;
  queued: number;
  deferred: number;
};

export async function runCampaignDialerCron(
  db: Database,
  options: { originateEnabled: boolean },
  runningCampaigns?: RunningVoiceCampaign[],
): Promise<CampaignCronResult> {
  const running = runningCampaigns ?? (await listRunningVoiceCampaigns(db));
  let ticks = 0;
  let queued = 0;
  let deferred = 0;

  for (const campaign of running) {
    let tickResult;
    try {
      tickResult = await runCampaignDialerTick(db, campaign.tenantId, campaign.campaignId, null);
    } catch (err) {
      console.warn('Campaign tick skipped', campaign, err);
      continue;
    }

    ticks++;
    const queuedNumbers = tickResult.results
      .filter((row: (typeof tickResult.results)[number]) => row.outcome === 'queued')
      .map((row: (typeof tickResult.results)[number]) => ({ id: row.id, number: row.number }));
    queued += queuedNumbers.length;

    if (queuedNumbers.length === 0) continue;

    const originateResult = await attemptCampaignOriginate(db, {
      tenantId: campaign.tenantId,
      campaignId: campaign.campaignId,
      numbers: queuedNumbers,
      originateEnabled: options.originateEnabled,
      actorUserId: null,
    });
    deferred += originateResult.deferred;
  }

  return {
    campaigns: running.length,
    ticks,
    queued,
    deferred,
  };
}
