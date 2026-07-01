import { describe, expect, it } from 'vitest';
import { appendIsraeliOutboundDialplan, normalizeIsraeliLocalToE164 } from './israel-dialplan.js';

describe('israel dialplan helpers', () => {
  it('normalizes Israeli local and E164 formats', () => {
    expect(normalizeIsraeliLocalToE164('0501234567')).toBe('+972501234567');
    expect(normalizeIsraeliLocalToE164('031234567')).toBe('+97231234567');
    expect(normalizeIsraeliLocalToE164('+972501234567')).toBe('+972501234567');
    expect(normalizeIsraeliLocalToE164('972501234567')).toBe('+972501234567');
  });

  it('appends tenant outbound Goto patterns', () => {
    const lines: string[] = [];
    appendIsraeliOutboundDialplan(lines, 'rls-a-2433f849');
    const dialplan = lines.join('\n');
    expect(dialplan).toContain('_05XXXXXXXX');
    expect(dialplan).toContain('PBX_OUTBOUND_E164=+972${EXTEN:1}');
    expect(dialplan).toContain('Goto(outbound-pstn-rls-a-2433f849,${PBX_OUTBOUND_E164},1)');
    expect(dialplan).toContain('_+972X.');
    expect(dialplan).toContain('_972X.');
  });
});
