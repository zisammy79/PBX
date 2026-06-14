import { describe, expect, it } from 'vitest';
import { generateTelephonyConfig } from './generator.js';
import { isSipUsernameInPjsipConfig } from './runtime.js';

describe('telephony runtime helpers', () => {
  it('detects SIP username blocks in generated PJSIP', () => {
    const config = generateTelephonyConfig(
      [
        {
          tenantId: '11111111-1111-1111-1111-111111111111',
          slug: 'demo-company',
          asteriskContext: 't_demo_company',
          status: 'active',
        },
      ],
      [
        {
          tenantId: '11111111-1111-1111-1111-111111111111',
          tenantSlug: 'demo-company',
          asteriskContext: 't_demo_company',
          extensionNumber: '1003',
          displayName: 'Desk 1003',
          asteriskEndpointId: 'demo-company_ext_1003',
          sipUsername: 'demo-company_1003',
          sipSecret: 'secret-one-12345',
          status: 'active',
        },
      ],
      [],
      'v1',
    );

    expect(isSipUsernameInPjsipConfig(config.pjsipTenants, 'demo-company_1003')).toBe(true);
    expect(config.pjsipTenants).toContain('username=demo-company_1003');
    expect(config.pjsipTenants).toContain('auth=demo-company_1003_auth');
  });
});
