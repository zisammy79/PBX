import { describe, expect, it, vi, afterEach } from 'vitest';
import * as tenantContext from './tenant-context.js';
import { attemptCampaignOriginate } from './campaign-originate.js';

describe('attemptCampaignOriginate', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes deferred audit when originate is disabled', async () => {
    const auditActions: string[] = [];
    const tx = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [{ id: 'trunk-1' }],
          }),
        }),
      }),
      insert: () => ({
        values: (payload: { action?: string }) => {
          if (payload.action) auditActions.push(payload.action);
          return Promise.resolve();
        },
      }),
    };

    vi.spyOn(tenantContext, 'withTenantContext').mockImplementation(async (_db, _tenantId, fn) =>
      fn(tx as never),
    );

    const result = await attemptCampaignOriginate({} as never, {
      tenantId: '11111111-1111-1111-1111-111111111111',
      campaignId: '22222222-2222-2222-2222-222222222222',
      numbers: [{ id: '33333333-3333-3333-3333-333333333333', number: '+15551234567' }],
      originateEnabled: false,
      actorUserId: null,
    });

    expect(result).toEqual({ attempted: 0, deferred: 1 });
    expect(auditActions).toContain('campaign.dial.deferred_no_originate');
  });
});
