import { describe, expect, it } from 'vitest';
import { generateTelephonyConfig, redactGeneratedConfig } from './generator.js';
import { validateGeneratedConfig } from './validate.js';

describe('telephony config generator', () => {
  const tenant = {
    tenantId: '11111111-1111-1111-1111-111111111111',
    slug: 'acme',
    asteriskContext: 't_acme',
    status: 'active',
  };

  const extensions = [
    {
      tenantId: tenant.tenantId,
      tenantSlug: 'acme',
      asteriskContext: 't_acme',
      extensionNumber: '1001',
      displayName: 'Desk 1',
      asteriskEndpointId: 'acme_ext_1001',
      sipUsername: 'acme_1001',
      sipSecret: 'secret-one-12345',
      status: 'active' as const,
    },
    {
      tenantId: tenant.tenantId,
      tenantSlug: 'acme',
      asteriskContext: 't_acme',
      extensionNumber: '1002',
      displayName: 'Desk 2',
      asteriskEndpointId: 'acme_ext_1002',
      sipUsername: 'acme_1002',
      sipSecret: 'secret-two-12345',
      status: 'active' as const,
    },
  ];

  it('generates tenant-prefixed PJSIP and dialplan', () => {
    const config = generateTelephonyConfig([tenant], extensions, [], 'v1');
    expect(config.pjsipTenants).toContain('[acme_ext_1001]');
    expect(config.pjsipTenants).toContain('[acme_1001]');
    expect(config.pjsipTenants).toContain('context=t_acme');
    expect(config.pjsipTenants).toContain('allow=ulaw,alaw');
    expect(config.pjsipTenants).toContain('rewrite_contact=yes');
    expect(config.pjsipTenants).toContain('rtp_symmetric=yes');
    expect(config.pjsipTenants).toContain('force_rport=yes');
    expect(config.pjsipTenants).toContain('direct_media=no');
    expect(config.pjsipTenants).toContain('qualify_frequency=30');
    expect(config.pjsipTenants).toContain('qualify_timeout=3');
    expect(config.pjsipTenants).toContain('remove_unavailable=yes');
    expect(config.pjsipTenants).not.toContain('rewrite_contact=no');
    expect(config.pjsipTenants).not.toContain('qualify_frequency=0');
    expect(config.extensionsTenants).toContain('[t_acme]');
    expect(config.extensionsTenants).toContain('Stasis(pbx-platform,acme');
  });

  it('allows duplicate extension numbers across tenants', () => {
    const tenantB = { ...tenant, tenantId: '22222222-2222-2222-2222-222222222222', slug: 'beta', asteriskContext: 't_beta' };
    const extB = { ...extensions[0]!, tenantId: tenantB.tenantId, tenantSlug: 'beta', asteriskContext: 't_beta', asteriskEndpointId: 'beta_ext_1001', sipUsername: 'beta_1001' };
    const config = generateTelephonyConfig([tenant, tenantB], [...extensions, extB], [], 'v2');
    expect(config.pjsipTenants).toContain('acme_ext_1001');
    expect(config.pjsipTenants).toContain('beta_ext_1001');
    expect(config.pjsipTenants).toContain('aors=acme_1001');
  });

  it('redacts secrets for diagnostics', () => {
    const config = generateTelephonyConfig([tenant], extensions, [], 'v1');
    const redacted = redactGeneratedConfig(config);
    expect(redacted.pjsipTenants).not.toContain('secret-one-12345');
    expect(redacted.pjsipTenants).toContain('[REDACTED]');
  });

  it('validates generated configuration', () => {
    const config = generateTelephonyConfig([tenant], extensions, [], 'v1');
    const result = validateGeneratedConfig(config);
    expect(result.valid).toBe(true);
  });

  it('rejects duplicate endpoint identifiers', () => {
    const dup = { ...extensions[1]!, asteriskEndpointId: 'acme_ext_1001' };
    expect(() => generateTelephonyConfig([tenant], [extensions[0]!, dup], [], 'v1')).toThrow(/Duplicate endpoint/);
  });

  it('rejects duplicate aor identifiers', () => {
    const dup = { ...extensions[1]!, sipUsername: 'acme_1001' };
    expect(() => generateTelephonyConfig([tenant], [extensions[0]!, dup], [], 'v1')).toThrow(/Duplicate aor/);
  });
});
