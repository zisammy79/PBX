import { Inject, Injectable } from '@nestjs/common';
import {
  attemptCampaignOriginate,
  type CampaignOriginateNumber,
  type CampaignOriginateResult,
} from '@pbx/database';
import { CONFIG, DATABASE } from '../../common/tokens.js';
import type { AppConfig } from '../../config.js';
import type { AuthenticatedUser } from '../auth/auth.service.js';

@Injectable()
export class CampaignOriginateService {
  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    @Inject(DATABASE) private readonly database: ReturnType<typeof import('@pbx/database').createDatabase>,
  ) {}

  async originateQueuedNumbers(
    actor: AuthenticatedUser | null,
    tenantId: string,
    campaignId: string,
    numbers: CampaignOriginateNumber[],
  ): Promise<CampaignOriginateResult> {
    return attemptCampaignOriginate(this.database.db, {
      tenantId,
      campaignId,
      numbers,
      originateEnabled: this.config.campaignOriginateEnabled,
      actorUserId: actor?.id ?? null,
    });
  }
}
