export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function formatCurrency(amount: string | number | null | undefined, currency = 'USD'): string {
  if (amount === null || amount === undefined || amount === '') return '—';
  const value = Number(amount);
  if (!Number.isFinite(value)) return String(amount);
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value);
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function externalValidationLabel(status?: string | null): string {
  if (!status || status === 'NOT_TESTED' || status === 'DEFERRED') {
    return 'External AI verification — Not tested';
  }
  return `External AI verification — ${status}`;
}

export function demoAiModeLabel(mode?: string | null): string {
  if (!mode || mode === 'deterministic') {
    return 'Demo AI mode — deterministic local provider';
  }
  return `Demo AI mode — ${mode}`;
}

export function stripeStatusLabel(status?: string | null): string {
  if (status === 'TEST') return 'Stripe test mode';
  if (status === 'LIVE') return 'Stripe live mode';
  return status === 'DISABLED' ? 'Payment integration — Disabled' : `Payment integration — ${status ?? 'Unknown'}`;
}

export function providerCostLabel(status?: string | null): string {
  return status === 'UNAVAILABLE'
    ? 'Provider cost — Unavailable'
    : `Provider cost — ${status ?? 'Unknown'}`;
}

export function pstnVerificationLabel(status?: string | null): string {
  if (!status || status === 'NOT_PERFORMED' || status === 'DISABLED') {
    return 'PSTN verification — Not performed';
  }
  return `PSTN verification — ${status}`;
}
