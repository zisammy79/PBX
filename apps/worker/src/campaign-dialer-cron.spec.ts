import { describe, expect, it, vi, beforeEach } from 'vitest';
import { runCampaignDialerCron } from './campaign-dialer-cron.js';

const runCampaignDialerTick = vi.fn();
const attemptCampaignOriginate = vi.fn();

vi.mock('@pbx/database', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@pbx/database')>();
  return {
    ...actual,
    runCampaignDialerTick: (...args: unknown[]) => runCampaignDialerTick(...args),
    attemptCampaignOriginate: (...args: unknown[]) => attemptCampaignOriginate(...args),
  };
});

describe('runCampaignDialerCron', () => {
  beforeEach(() => {
    runCampaignDialerTick.mockReset();
    attemptCampaignOriginate.mockReset();
  });

  it('ticks running voice campaigns and defers originate for queued numbers', async () => {
    runCampaignDialerTick.mockResolvedValue({
      campaignId: '22222222-2222-2222-2222-222222222222',
      processed: 1,
      inFlight: 1,
      results: [
        { id: '33333333-3333-3333-3333-333333333333', number: '+15551234567', outcome: 'queued', attempts: 1 },
      ],
    });
    attemptCampaignOriginate.mockResolvedValue({ attempted: 0, deferred: 1 });

    const result = await runCampaignDialerCron(
      {} as never,
      { originateEnabled: false },
      [{ tenantId: '11111111-1111-1111-1111-111111111111', campaignId: '22222222-2222-2222-2222-222222222222' }],
    );

    expect(result).toEqual({ campaigns: 1, ticks: 1, queued: 1, deferred: 1 });
    expect(attemptCampaignOriginate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ originateEnabled: false }),
    );
  });
});
