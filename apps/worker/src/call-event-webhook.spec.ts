import { describe, expect, it } from 'vitest';
import { TELEPHONY_EVENT_MAP, WebhookEventEnvelopeSchema } from '@pbx/contracts';

describe('call.answered webhook payload', () => {
  it('maps BRIDGED telephony events to call.answered with caller and callee', () => {
    expect(TELEPHONY_EVENT_MAP.BRIDGED).toBe('call.answered');

    const envelope = WebhookEventEnvelopeSchema.parse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      type: 'call.answered',
      apiVersion: 'v1',
      tenantId: '550e8400-e29b-41d4-a716-446655440001',
      createdAt: new Date().toISOString(),
      correlationId: '550e8400-e29b-41d4-a716-446655440002',
      data: {
        callId: '550e8400-e29b-41d4-a716-446655440003',
        caller: '1001',
        callee: '1002',
        bridgeId: 'bridge-abc',
        source: 'platform',
      },
    });

    expect(envelope.data.caller).toBe('1001');
    expect(envelope.data.callee).toBe('1002');
  });
});
