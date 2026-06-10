import { describe, expect, it } from 'vitest';
import { CreateAiAgentSchema, CreateAiProviderConnectionSchema } from './ai.js';

describe('AI contracts', () => {
  it('accepts supported provider types', () => {
    for (const providerType of ['openai', 'gemini', 'azure_openai', 'anthropic', 'custom', 'deterministic-test']) {
      const parsed = CreateAiProviderConnectionSchema.parse({
        providerType,
        name: 'Primary',
        credentials: providerType === 'deterministic-test' ? {} : { apiKey: 'sk-test-key-12345' },
      });
      expect(parsed.providerType).toBe(providerType);
    }
  });

  it('accepts agent with barge-in and transfer aliases', () => {
    const parsed = CreateAiAgentSchema.parse({
      name: 'Support',
      routeNumber: '8999',
      transferExtensionId: '550e8400-e29b-41d4-a716-446655440000',
      transferDestinationAliases: { human_support: '1002' },
      providerConnectionId: '550e8400-e29b-41d4-a716-446655440001',
      provider: 'deterministic-test',
      model: 'deterministic-behavior-v1',
      bargeIn: { enabled: true, thresholdMs: 120 },
      allowedTools: ['transfer_call', 'end_call'],
    });
    expect(parsed.bargeIn?.enabled).toBe(true);
    expect(parsed.transferDestinationAliases.human_support).toBe('1002');
  });
});
