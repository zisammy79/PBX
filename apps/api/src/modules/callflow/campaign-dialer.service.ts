import { Inject, Injectable } from '@nestjs/common';
import { notFound, validationError } from '@pbx/contracts';
import { and, asc, count, eq, inArray, isNull, lt, or } from 'drizzle-orm';
import {
  auditEvents,
  campaignNumbers,
  campaigns,
  dncListNumbers,
  dncLists,
  platformEvents,
  sipTrunks,
  withTenantContext,
} from '@pbx/database';
import { DATABASE } from '../../common/tokens.js';
import type { AuthenticatedUser } from '../auth/auth.service.js';

export type CampaignDialOutcome = 'skipped_dnc' | 'failed_no_trunk' | 'queued';

export function normalizeCampaignNumber(number: string): string {
  return number.replace(/\D/g, '');
}

export function classifyDialAttempt(
  number: string,
  dncNumbers: ReadonlySet<string>,
  hasTrunk: boolean,
): CampaignDialOutcome {
  if (dncNumbers.has(normalizeCampaignNumber(number))) {
    return 'skipped_dnc';
  }
  if (!hasTrunk) {
    return 'failed_no_trunk';
  }
  return 'queued';
}

export function shouldCountAttempt(outcome: CampaignDialOutcome): boolean {
  return outcome !== 'skipped_dnc';
}

type DbTx = Parameters<Parameters<typeof withTenantContext>[2]>[0];

export type CampaignTickResult = {
  campaignId: string;
  processed: number;
  inFlight: number;
  results: Array<{
    id: string;
    number: string;
    outcome: CampaignDialOutcome;
    attempts: number;
  }>;
};

@Injectable()
export class CampaignDialerService {
  constructor(
    @Inject(DATABASE) private readonly database: ReturnType<typeof import('@pbx/database').createDatabase>,
  ) {}

  async tick(actor: AuthenticatedUser, tenantId: string, campaignId: string): Promise<CampaignTickResult> {
    return withTenantContext(this.database.db, tenantId, async (db) => {
      const [campaign] = await db
        .select()
        .from(campaigns)
        .where(and(eq(campaigns.tenantId, tenantId), eq(campaigns.id, campaignId)))
        .limit(1);
      if (!campaign) throw notFound('Campaign');
      if (campaign.status !== 'running') {
        throw validationError({ status: 'Campaign must be running to tick the dialer' });
      }
      if (campaign.technology !== 'voice') {
        throw validationError({ technology: 'Campaign dialer tick supports voice campaigns only' });
      }

      const [inFlightRow] = await db
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

      const dncNumbers = await this.loadDncNumberSet(db, tenantId);
      const hasTrunk = await this.tenantHasActiveTrunk(db, tenantId);

      const candidates = await db
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

        await db
          .update(campaignNumbers)
          .set({ lastStatus: outcome, attempts: nextAttempts })
          .where(and(eq(campaignNumbers.tenantId, tenantId), eq(campaignNumbers.id, row.id)));

        await this.recordDialAttempt(db, tenantId, actor.id, campaignId, row.id, row.number, outcome, nextAttempts);

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
        inFlight: inFlight + results.filter((r) => r.outcome === 'queued').length,
        results,
      };
    });
  }

  private async loadDncNumberSet(db: DbTx, tenantId: string): Promise<Set<string>> {
    const rows = await db
      .select({ number: dncListNumbers.number })
      .from(dncListNumbers)
      .innerJoin(dncLists, eq(dncListNumbers.listId, dncLists.id))
      .where(and(eq(dncListNumbers.tenantId, tenantId), eq(dncLists.listType, 'dnc')));

    return new Set(rows.map((row) => normalizeCampaignNumber(row.number)));
  }

  private async tenantHasActiveTrunk(db: DbTx, tenantId: string): Promise<boolean> {
    const [row] = await db
      .select({ id: sipTrunks.id })
      .from(sipTrunks)
      .where(and(eq(sipTrunks.tenantId, tenantId), eq(sipTrunks.isActive, true)))
      .limit(1);
    return Boolean(row);
  }

  private async recordDialAttempt(
    db: DbTx,
    tenantId: string,
    actorUserId: string,
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
      actorType: 'user',
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
}
