import { validationError } from '@pbx/contracts';

const ISRAEL_E164 = /^\+972[2-9]\d{7,8}$/;

export function normalizeIsraeliE164(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('+')) {
    const digits = trimmed.replace(/\D/g, '');
    return `+${digits}`;
  }

  const digits = trimmed.replace(/\D/g, '');
  if (digits.startsWith('972')) {
    return `+${digits}`;
  }
  if (digits.startsWith('0')) {
    return `+972${digits.slice(1)}`;
  }
  throw validationError({ e164: 'Expected Israeli number in E.164 or local 0-prefixed format' });
}

export function assertIsraeliE164(e164: string): string {
  const normalized = e164.startsWith('+') ? e164 : normalizeIsraeliE164(e164);
  if (!ISRAEL_E164.test(normalized)) {
    throw validationError({ e164: 'Invalid Israeli E.164 number' });
  }
  return normalized;
}

export function parseTerminationHost(terminationUri: string): { host: string; port: number } {
  const match = terminationUri.match(/^sip:([^:;@]+)(?::(\d+))?/i);
  if (!match?.[1]) {
    throw validationError({ terminationUri: 'Invalid Twilio termination SIP URI' });
  }
  return { host: match[1], port: match[2] ? Number(match[2]) : 5060 };
}
