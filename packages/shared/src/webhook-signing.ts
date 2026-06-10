import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const WEBHOOK_SIGNATURE_HEADER = 'x-pbx-webhook-signature';
export const WEBHOOK_TIMESTAMP_HEADER = 'x-pbx-webhook-timestamp';
export const WEBHOOK_ID_HEADER = 'x-pbx-webhook-id';
export const WEBHOOK_ATTEMPT_HEADER = 'x-pbx-webhook-attempt';

export const WEBHOOK_REPLAY_TOLERANCE_SECONDS = 300;

export function signWebhookBody(secret: string, timestamp: number, rawBody: string): string {
  const payload = `${timestamp}.${rawBody}`;
  const digest = createHmac('sha256', secret).update(payload).digest('hex');
  return `v1=${digest}`;
}

export function verifyWebhookSignature(
  secret: string,
  timestamp: number,
  rawBody: string,
  signatureHeader: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  if (Math.abs(nowSeconds - timestamp) > WEBHOOK_REPLAY_TOLERANCE_SECONDS) {
    return false;
  }
  const expected = signWebhookBody(secret, timestamp, rawBody);
  const provided = signatureHeader.trim();
  if (!provided.startsWith('v1=')) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function generateWebhookSigningSecret(): string {
  return randomBytes(32).toString('base64url');
}
