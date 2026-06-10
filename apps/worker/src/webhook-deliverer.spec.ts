import { describe, expect, it } from 'vitest';
import { MAX_WEBHOOK_ATTEMPTS } from '@pbx/contracts';
import {
  isTerminalDeliveryStatus,
  resolveFailureOutcome,
} from './webhook-deliverer.js';

describe('webhook-deliverer restart behavior', () => {
  it('treats delivered and dead_letter as terminal', () => {
    expect(isTerminalDeliveryStatus('delivered')).toBe(true);
    expect(isTerminalDeliveryStatus('dead_letter')).toBe(true);
    expect(isTerminalDeliveryStatus('pending')).toBe(false);
    expect(isTerminalDeliveryStatus('failed')).toBe(false);
  });

  it('retries transient failures until attempts exhausted', () => {
    expect(resolveFailureOutcome(1, 'timeout', MAX_WEBHOOK_ATTEMPTS)).toBe('failed');
    expect(resolveFailureOutcome(MAX_WEBHOOK_ATTEMPTS, 'timeout', MAX_WEBHOOK_ATTEMPTS)).toBe(
      'dead_letter',
    );
  });

  it('dead-letters permanent client errors immediately', () => {
    expect(resolveFailureOutcome(1, 'client_error', MAX_WEBHOOK_ATTEMPTS)).toBe('dead_letter');
  });
});
