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
