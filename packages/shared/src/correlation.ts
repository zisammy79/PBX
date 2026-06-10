import { randomUUID } from 'node:crypto';

export function createCorrelationId(): string {
  return randomUUID();
}

export const CORRELATION_HEADER = 'x-correlation-id';
export const IDEMPOTENCY_HEADER = 'idempotency-key';

const MAX_CORRELATION_ID_LENGTH = 128;
const CORRELATION_ID_PATTERN = /^[a-zA-Z0-9._-]+$/;

export function normalizeCorrelationId(raw: string | undefined): string {
  if (!raw) return createCorrelationId();
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_CORRELATION_ID_LENGTH) {
    return createCorrelationId();
  }
  if (!CORRELATION_ID_PATTERN.test(trimmed)) {
    return createCorrelationId();
  }
  return trimmed;
}
