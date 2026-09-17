import { describe, expect, it } from 'vitest';
import {
  CreateCustomDestinationSchema,
  UpdateCustomDestinationSchema,
} from '../src/callflow.js';

describe('callflow contracts', () => {
  it('rejects invalid custom destination type on create', () => {
    const result = CreateCustomDestinationSchema.safeParse({
      name: 'Forward to support',
      destinationType: 'api_key_in_config',
      config: { apiKey: 'secret' },
    });
    expect(result.success).toBe(false);
  });

  it('accepts allowed custom destination types', () => {
    const result = CreateCustomDestinationSchema.safeParse({
      name: 'Set Hebrew',
      destinationType: 'set_language',
      config: { language: 'he' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid custom destination type on update', () => {
    const result = UpdateCustomDestinationSchema.safeParse({
      destinationType: 'forward_to_pstn',
    });
    expect(result.success).toBe(false);
  });
});
