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
  });
});
