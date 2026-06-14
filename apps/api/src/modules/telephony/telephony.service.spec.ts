import { describe, expect, it } from 'vitest';
import { generateTelephonyConfig } from '@pbx/telephony-config';

describe('telephony provisioning generator', () => {
  it('uses the visible SIP username for digest authentication', () => {
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

    expect(config.pjsipTenants).toContain('username=demo-company_1003');
    expect(config.pjsipTenants).toContain('[demo-company_1003_auth]');
    expect(config.pjsipTenants).toContain('auth=demo-company_1003_auth');
    expect(config.pjsipTenants).toContain('[demo-company_1003]');
    expect(config.pjsipTenants).toContain('type=aor');
  });
});
