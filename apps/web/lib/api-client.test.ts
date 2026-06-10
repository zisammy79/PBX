import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiFetch } from '@/lib/api-client';

describe('apiFetch', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('throws structured ApiError on failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        text: async () =>
          JSON.stringify({
            code: 'FORBIDDEN',
            message: 'Access denied',
            correlationId: 'corr-1',
          }),
      }),
    );

    await expect(apiFetch('/tenants/x')).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'Access denied',
      status: 403,
      correlationId: 'corr-1',
    });
  });

  it('dispatches session-expired event on 401', async () => {
    const handler = vi.fn();
    window.addEventListener('pbx:session-expired', handler);

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ message: 'Unauthorized' }),
      }),
    );

    await expect(apiFetch('/auth/me')).rejects.toBeInstanceOf(ApiError);
    expect(handler).toHaveBeenCalledTimes(1);
    window.removeEventListener('pbx:session-expired', handler);
  });
});
