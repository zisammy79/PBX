import { normalizeCampaignNumber } from './campaign-dialer.service.js';

const MIN_DIGITS = 7;
const MAX_DIGITS = 15;

export function parseCampaignNumberInput(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const normalized = normalizeCampaignNumber(trimmed);
  if (normalized.length < MIN_DIGITS || normalized.length > MAX_DIGITS) {
    return null;
  }
  return trimmed.startsWith('+') ? `+${normalized}` : normalized;
}

export function dedupeCampaignNumbers(numbers: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of numbers) {
    const parsed = parseCampaignNumberInput(raw);
    if (!parsed) continue;
    const key = normalizeCampaignNumber(parsed);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(parsed);
  }
  return out;
}
