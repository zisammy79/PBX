import type { TwilioAvailableNumberRow, TwilioNumberType } from '@pbx/contracts';

type TwilioAvailableRecord = {
  phoneNumber: string;
  friendlyName?: string | null;
  locality?: string | null;
  region?: string | null;
  isoCountry?: string | null;
  capabilities?: {
    voice?: boolean;
    SMS?: boolean;
    MMS?: boolean;
  };
  addressRequirements?: string | null;
};

export function mapTwilioAvailableNumber(
  row: TwilioAvailableRecord,
  country: string,
  numberType: Exclude<TwilioNumberType, 'any'>,
): TwilioAvailableNumberRow {
  const addressRequirement = row.addressRequirements ?? null;
  const requiresRegulatory =
    addressRequirement !== null &&
    addressRequirement !== 'none' &&
    addressRequirement !== '' &&
    addressRequirement !== 'any';

  return {
    e164: row.phoneNumber,
    friendlyName: row.friendlyName ?? null,
    locality: row.locality ?? null,
    region: row.region ?? null,
    country: row.isoCountry ?? country,
    numberType,
    capabilities: {
      voice: row.capabilities?.voice ?? false,
      sms: row.capabilities?.SMS ?? false,
      mms: row.capabilities?.MMS ?? false,
    },
    addressRequirement,
    regulatoryStatus: requiresRegulatory ? 'requires_regulatory_setup' : 'none',
    monthlyPrice: null,
  };
}

export function filterAvailableNumbers(
  rows: TwilioAvailableNumberRow[],
  filters: {
    voiceRequired?: boolean;
    smsCapable?: boolean;
    mmsCapable?: boolean;
  },
): TwilioAvailableNumberRow[] {
  return rows.filter((row) => {
    if (filters.voiceRequired && !row.capabilities.voice) return false;
    if (filters.smsCapable === true && !row.capabilities.sms) return false;
    if (filters.mmsCapable === true && !row.capabilities.mms) return false;
    return true;
  });
}

export function dedupeAvailableNumbers(rows: TwilioAvailableNumberRow[]): TwilioAvailableNumberRow[] {
  const seen = new Set<string>();
  const out: TwilioAvailableNumberRow[] = [];
  for (const row of rows) {
    if (seen.has(row.e164)) continue;
    seen.add(row.e164);
    out.push(row);
  }
  return out;
}
