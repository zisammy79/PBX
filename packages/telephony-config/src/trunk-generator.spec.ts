import { describe, expect, it } from 'vitest';
import {
  generateTrunkConfig,
  normalizeOutboundNumber,
  redactTrunkConfig,
  validateDestinationCountry,
} from './trunk-generator.js';

describe('trunk generator', () => {
  const trunk = {
    tenantId: '11111111-1111-1111-1111-111111111111',
    tenantSlug: 'acme',
    trunkId: 't1',
    name: 'Carrier A',
    slug: 'carrier-a',
    asteriskTrunkId: 'acme_trunk_carrier_a',
    authMode: 'registration' as const,
    transport: 'udp' as const,
    isActive: true,
    registrar: 'sip.carrier.example',
    username: 'acme_user',
    password: 'secret-trunk-pass',
    allowedCodecs: ['ulaw'],
    dtmfMode: 'rfc4733' as const,
    assignedDid: '+15551234567',
    allowedCallerId: '+15551234567',
    maxConcurrentCalls: 5,
    maxCallDurationSeconds: 3600,
    allowedDestinationCountries: ['US'],
  };

  it('generates registration trunk PJSIP', () => {
    const cfg = generateTrunkConfig([trunk], [], []);
    expect(cfg.pjsipTrunks).toContain('[acme_trunk_carrier_a]');
    expect(cfg.pjsipTrunks).toContain('type=registration');
    expect(cfg.pjsipTrunks).toContain('password=secret-trunk-pass');
    expect(cfg.trunkCount).toBe(1);
  });

  it('redacts trunk secrets', () => {
    const cfg = generateTrunkConfig([trunk], [], []);
    const redacted = redactTrunkConfig(cfg);
    expect(redacted.pjsipTrunks).toContain('password=[REDACTED]');
    expect(redacted.pjsipTrunks).not.toContain('secret-trunk-pass');
  });

  it('normalizes US outbound numbers', () => {
    expect(normalizeOutboundNumber('5551234567')).toBe('+15551234567');
    expect(normalizeOutboundNumber('+15551234567')).toBe('+15551234567');
  });

  it('validates destination countries', () => {
    expect(validateDestinationCountry('+15551234567', ['US']).allowed).toBe(true);
    expect(validateDestinationCountry('+442071234567', ['US']).allowed).toBe(false);
    expect(validateDestinationCountry('+97221234567', ['IL']).allowed).toBe(true);
  });

  it('generates credential-based outbound on ip trunk (Twilio termination)', () => {
    const twilioTrunk = {
      ...trunk,
      authMode: 'ip' as const,
      registrar: 'acme.pstn.twilio.com',
      providerAdapter: 'twilio',
    };
    const cfg = generateTrunkConfig([twilioTrunk], [], []);
    expect(cfg.pjsipTrunks).toContain('contact=sip:acme.pstn.twilio.com');
    expect(cfg.pjsipTrunks).toContain('outbound_auth=acme_trunk_carrier_a_auth');
    expect(cfg.pjsipTrunks).toContain('match=54.171.127.192/32');
    expect(cfg.pjsipTrunks).not.toContain('type=registration');
    expect(cfg.pjsipTrunks).not.toContain('match=0.0.0.0/0');
  });

  it('generates inbound PSTN dialplan for E.164 DID', () => {
    const cfg = generateTrunkConfig(
      [{ ...trunk, authMode: 'ip' as const, providerAdapter: 'twilio' }],
      [
        {
          tenantId: trunk.tenantId,
          tenantSlug: trunk.tenantSlug,
          asteriskContext: 't_acme',
          didPattern: '+97233820386',
          destinationType: 'extension',
          destinationValue: '100',
          trunkAsteriskId: trunk.asteriskTrunkId,
        },
      ],
      [],
    );
    expect(cfg.inboundDialplan).toContain('[from-pstn-acme]');
    expect(cfg.inboundDialplan).toContain('exten => +97233820386,1');
    expect(cfg.inboundDialplan).toContain('Stasis(pbx-platform,acme,${CALLERID(num)},100)');
  });

  it('generates consolidated outbound PSTN dialplan with E164 dial target', () => {
    const cfg = generateTrunkConfig(
      [trunk],
      [],
      [
        {
          tenantId: trunk.tenantId,
          tenantSlug: trunk.tenantSlug,
          asteriskContext: 't_acme',
          pattern: '^05\\d{8}$',
          callerId: '+97233820386',
          trunkAsteriskId: trunk.asteriskTrunkId,
        },
        {
          tenantId: trunk.tenantId,
          tenantSlug: trunk.tenantSlug,
          asteriskContext: 't_acme',
          pattern: '^\\+972[2-9]\\d{7,8}$',
          callerId: '+97233820386',
          trunkAsteriskId: trunk.asteriskTrunkId,
        },
      ],
    );
    expect(cfg.outboundDialplan).toContain('[outbound-pstn-acme]');
    expect(cfg.outboundDialplan).toContain('exten => _+X.,1');
    expect(cfg.outboundDialplan).toContain('Set(CALLERID(num)=+97233820386)');
    expect(cfg.outboundDialplan).toContain('Dial(PJSIP/${EXTEN}@acme_trunk_carrier_a,,g)');
    expect(cfg.outboundDialplan.match(/\[outbound-pstn-acme\]/g)?.length).toBe(1);
  });
});
