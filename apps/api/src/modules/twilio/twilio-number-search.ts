import type { TwilioAvailableNumberRow, TwilioNumberSearchQuery, TwilioNumberType } from '@pbx/contracts';

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

export type TwilioAvailableNumbersListParams = {
  limit: number;
  contains?: string;
  areaCode?: number;
};

export type PhoneNumberSearchPostFilters = {
  e164Prefix?: string;
  containsSuffix?: string;
};

export type AppliedPhoneNumberSearchFilters = {
  areaCodeInput?: string;
  e164Prefix?: string;
};

export type NormalizedPhoneNumberSearchFilters = {
  twilioParams: TwilioAvailableNumbersListParams;
  postFilters: PhoneNumberSearchPostFilters;
  appliedFilters: AppliedPhoneNumberSearchFilters;
};

export function normalizeIlPrefixToE164Prefix(input: string): string | undefined {
  const cleaned = input.replace(/[\s\-()]/g, '').trim();
  if (!cleaned) return undefined;

  if (cleaned.startsWith('+972')) return cleaned;
  if (cleaned.startsWith('972')) return `+${cleaned}`;
  if (cleaned.startsWith('0')) return `+972${cleaned.slice(1)}`;
  if (/^\d+$/.test(cleaned)) return `+972${cleaned}`;

  throw new Error('Invalid Israeli prefix');
}

export function normalizeGenericInternationalPrefix(input: string): string | undefined {
  const cleaned = input.replace(/[\s\-()]/g, '').trim();
  if (!cleaned) return undefined;
  if (cleaned.startsWith('+')) return cleaned;
  if (/^\d+$/.test(cleaned)) return `+${cleaned}`;
  return undefined;
}

export function normalizePhoneNumberSearchFilters(
  query: TwilioNumberSearchQuery,
): NormalizedPhoneNumberSearchFilters {
  const country = query.country.toUpperCase();
  const areaCodeInput = query.areaCode?.trim() || undefined;
  const containsInput = query.contains?.trim() || undefined;

  const twilioParams: TwilioAvailableNumbersListParams = { limit: query.limit };
  const postFilters: PhoneNumberSearchPostFilters = {};
  const appliedFilters: AppliedPhoneNumberSearchFilters = {};

  if (country === 'US' || country === 'CA') {
    if (areaCodeInput) {
      const parsedAreaCode = Number.parseInt(areaCodeInput, 10);
      if (!Number.isNaN(parsedAreaCode)) twilioParams.areaCode = parsedAreaCode;
    }
    if (containsInput) twilioParams.contains = containsInput;
  } else if (country === 'IL') {
    if (areaCodeInput) {
      const ilPrefix = normalizeIlPrefixToE164Prefix(areaCodeInput);
      if (ilPrefix) {
        twilioParams.contains = ilPrefix;
        postFilters.e164Prefix = ilPrefix;
        appliedFilters.areaCodeInput = areaCodeInput;
        appliedFilters.e164Prefix = ilPrefix;
      }
    } else if (containsInput) {
      twilioParams.contains = containsInput;
    }
    if (containsInput && areaCodeInput) {
      postFilters.containsSuffix = containsInput;
    }
  } else {
    if (areaCodeInput) {
      const prefix = normalizeGenericInternationalPrefix(areaCodeInput);
      if (prefix) {
        twilioParams.contains = prefix;
        postFilters.e164Prefix = prefix;
        appliedFilters.areaCodeInput = areaCodeInput;
        appliedFilters.e164Prefix = prefix;
      }
    }
    if (containsInput && !twilioParams.contains) {
      twilioParams.contains = containsInput;
    } else if (containsInput && areaCodeInput) {
      postFilters.containsSuffix = containsInput;
    }
  }

  return { twilioParams, postFilters, appliedFilters };
}

export function buildTwilioAvailableNumbersQuery(
  query: TwilioNumberSearchQuery,
): NormalizedPhoneNumberSearchFilters {
  return normalizePhoneNumberSearchFilters(query);
}

export function postFilterAvailableNumbers(
  rows: TwilioAvailableNumberRow[],
  postFilters: PhoneNumberSearchPostFilters,
): TwilioAvailableNumberRow[] {
  return rows.filter((row) => {
    if (postFilters.e164Prefix && !row.e164.startsWith(postFilters.e164Prefix)) return false;
    if (postFilters.containsSuffix) {
      const digits = postFilters.containsSuffix.replace(/\D/g, '');
      if (digits && !row.e164.replace(/\D/g, '').includes(digits)) return false;
    }
    return true;
  });
}
