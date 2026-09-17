import { Inject, Injectable } from '@nestjs/common';
import { notFound, validationError } from '@pbx/contracts';
import { runCampaignDialerTick } from '@pbx/database';
import type { CampaignTickResult } from '@pbx/shared';
import { DATABASE } from '../../common/tokens.js';
import type { AuthenticatedUser } from '../auth/auth.service.js';

export {
  classifyDialAttempt,
  normalizeCampaignNumber,
  shouldCountAttempt,
  type CampaignDialOutcome,
  type CampaignTickResult,
} from '@pbx/shared';

@Injectable()
export class CampaignDialerService {
  constructor(
    @Inject(DATABASE) private readonly database: ReturnType<typeof import('@pbx/database').createDatabase>,
  ) {}

  async tick(actor: AuthenticatedUser, tenantId: string, campaignId: string): Promise<CampaignTickResult> {
    try {
      return await runCampaignDialerTick(this.database.db, tenantId, campaignId, actor.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'campaign_tick_failed';
      if (message === 'campaign_not_found') throw notFound('Campaign');
      if (message === 'campaign_not_running') {
        throw validationError({ status: 'Campaign must be running to tick the dialer' });
      }
      if (message === 'campaign_not_voice') {
        throw validationError({ technology: 'Campaign dialer tick supports voice campaigns only' });
      }
      throw err;
    }
  }
}
