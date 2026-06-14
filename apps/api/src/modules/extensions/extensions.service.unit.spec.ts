import { describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../../config.js';
import { ExtensionsService } from './extensions.service.js';
import type { TelephonyService } from '../telephony/telephony.service.js';

describe('ExtensionsService provisioning', () => {
  const config = {
    encryptionMasterKey: 'f6edb2fe6311f593eac67296b0e504c70765192433a28bfbc42e835e9f325c40',
    telephonyEnabled: true,
    sipPublicDomain: '192.168.86.199',
    sipUdpPort: 5060,
    publicApiUrl: 'http://localhost:3001',
  } as AppConfig;

  it('reports ready only when runtime verification succeeds', async () => {
    const telephonyService = {
      provisionGlobalConfiguration: vi.fn().mockResolvedValue({
        activated: true,
        version: 'v1',
        skippedCredentialUsernames: [],
      }),
      verifyExtensionRuntime: vi.fn().mockResolvedValue({
        ready: true,
        sipUsername: 'demo-company_1003',
      }),
      getExtensionProvisioningState: vi.fn(),
    } as unknown as TelephonyService;

    const tenantSettings = {
      readRecordCallsByDefault: vi.fn().mockResolvedValue(false),
    };

    const service = new ExtensionsService(
      config,
      {} as ReturnType<typeof import('@pbx/database').createDatabase>,
      telephonyService,
      tenantSettings as never,
    );

    const result = await (service as unknown as {
      provisionExtensionAfterPersist: (
        actor: { id: string; tenantMemberships: []; platformRoles: [] },
        tenantId: string,
        extensionId: string,
      ) => Promise<{ status: string }>;
    }).provisionExtensionAfterPersist(
      { id: 'user-id', tenantMemberships: [], platformRoles: [] },
      'tenant-id',
      'extension-id',
    );

    expect(result.status).toBe('ready');
    expect(telephonyService.provisionGlobalConfiguration).toHaveBeenCalledOnce();
  });

  it('reports failed when runtime verification misses the extension', async () => {
    const telephonyService = {
      provisionGlobalConfiguration: vi.fn().mockResolvedValue({
        activated: true,
        version: 'v1',
        skippedCredentialUsernames: ['demo-company_1003'],
      }),
      verifyExtensionRuntime: vi.fn().mockResolvedValue({
        ready: false,
        sipUsername: 'demo-company_1003',
        reason: 'not_provisioned',
      }),
      getExtensionProvisioningState: vi.fn(),
    } as unknown as TelephonyService;

    const tenantSettings = {
      readRecordCallsByDefault: vi.fn().mockResolvedValue(false),
    };

    const service = new ExtensionsService(
      config,
      {} as ReturnType<typeof import('@pbx/database').createDatabase>,
      telephonyService,
      tenantSettings as never,
    );

    const result = await (service as unknown as {
      provisionExtensionAfterPersist: (
        actor: { id: string; tenantMemberships: []; platformRoles: [] },
        tenantId: string,
        extensionId: string,
      ) => Promise<{ status: string; reason?: string }>;
    }).provisionExtensionAfterPersist(
      { id: 'user-id', tenantMemberships: [], platformRoles: [] },
      'tenant-id',
      'extension-id',
    );

    expect(result.status).toBe('failed');
    expect(result.reason).toBe('not_provisioned');
  });
});
