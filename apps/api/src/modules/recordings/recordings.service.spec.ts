import { describe, expect, it } from 'vitest';
import { tenantAccessDenied } from '@pbx/contracts';
import type { AppConfig } from '../../config.js';
import { RecordingsService } from './recordings.service.js';
import type { ObjectStorageService } from '../../common/object-storage.service.js';

describe('RecordingsService authorization', () => {
  const config = {} as AppConfig;

  it('rejects human_agent without recording read permission', async () => {
    const service = new RecordingsService(
      config,
      {} as never,
      { isConfigured: () => true } as ObjectStorageService,
      { isActive: () => false } as never,
      { readRecordCallsByDefault: async () => false } as never,
    );

    await expect(
      service.createPlaybackUrl(
        {
          id: 'user-id',
          tenantMemberships: [{ tenantId: 'tenant-a', roles: ['human_agent'] }],
          platformRoles: [],
        } as never,
        'tenant-a',
        'recording-id',
      ),
    ).rejects.toMatchObject({ code: tenantAccessDenied().code });
  });

  it('rejects tenant_billing_administrator for recording list', async () => {
    const service = new RecordingsService(
      config,
      {} as never,
      { isConfigured: () => false } as ObjectStorageService,
      { isActive: () => false } as never,
      { readRecordCallsByDefault: async () => false } as never,
    );

    await expect(
      service.listExtensionRecordings(
        {
          id: 'user-id',
          tenantMemberships: [{ tenantId: 'tenant-a', roles: ['tenant_billing_administrator'] }],
          platformRoles: [],
        } as never,
        'tenant-a',
        'ext-id',
        { page: 1, pageSize: 20, sortOrder: 'desc' },
      ),
    ).rejects.toMatchObject({ code: tenantAccessDenied().code });
  });
});
