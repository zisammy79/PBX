export function resolveStripeStatusFromEnv(): 'DISABLED' | 'TEST' | 'LIVE' {
  const key = process.env.STRIPE_SECRET_KEY?.trim() ?? '';
  if (!key) return 'DISABLED';
  if (key.startsWith('sk_live_')) return 'LIVE';
  if (key.startsWith('sk_test_')) return 'TEST';
  return 'DISABLED';
}
