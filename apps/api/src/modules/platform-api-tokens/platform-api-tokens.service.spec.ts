import { describe, expect, it } from 'vitest';
import { CreatePlatformApiTokenSchema } from '@pbx/contracts';

describe('platform api token contracts', () => {
  it('accepts create payload with optional expiry', () => {
    const parsed = CreatePlatformApiTokenSchema.parse({
      name: 'production-automation',
      expiresAt: '2030-01-01T00:00:00.000Z',
    });
    expect(parsed.name).toBe('production-automation');
  });

  it('rejects empty token names', () => {
    expect(CreatePlatformApiTokenSchema.safeParse({ name: '' }).success).toBe(false);
  });
});
