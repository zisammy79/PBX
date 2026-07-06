/**
 * Israeli PSTN dial patterns for tenant contexts (local 0-prefix → E.164).
 */

const STASIS_APP = 'pbx-platform';

function stasisOutboundLine(tenantSlug: string, destinationExpr: string): string {
  return ` same => n,Stasis(${STASIS_APP},${tenantSlug},\${CALLERID(num)},outbound,${destinationExpr})`;
}

export function appendIsraeliOutboundDialplan(
  lines: string[],
  tenantSlug: string,
): void {
  lines.push(
    '; Israeli PSTN outbound — normalize local dialing then enter controller Stasis lifecycle',
    'exten => _05XXXXXXXX,1,NoOp(PBX outbound local mobile ${EXTEN})',
    ' same => n,Set(PBX_OUTBOUND_E164=+972${EXTEN:1})',
    stasisOutboundLine(tenantSlug, '${PBX_OUTBOUND_E164}'),
    ' same => n,Hangup()',
    'exten => _07XXXXXXXX,1,NoOp(PBX outbound local ${EXTEN})',
    ' same => n,Set(PBX_OUTBOUND_E164=+972${EXTEN:1})',
    stasisOutboundLine(tenantSlug, '${PBX_OUTBOUND_E164}'),
    ' same => n,Hangup()',
    'exten => _0[2-489]XXXXXXX,1,NoOp(PBX outbound local landline ${EXTEN})',
    ' same => n,Set(PBX_OUTBOUND_E164=+972${EXTEN:1})',
    stasisOutboundLine(tenantSlug, '${PBX_OUTBOUND_E164}'),
    ' same => n,Hangup()',
    'exten => _08XXXXXXX,1,NoOp(PBX outbound local ${EXTEN})',
    ' same => n,Set(PBX_OUTBOUND_E164=+972${EXTEN:1})',
    stasisOutboundLine(tenantSlug, '${PBX_OUTBOUND_E164}'),
    ' same => n,Hangup()',
    'exten => _09XXXXXXX,1,NoOp(PBX outbound local ${EXTEN})',
    ' same => n,Set(PBX_OUTBOUND_E164=+972${EXTEN:1})',
    stasisOutboundLine(tenantSlug, '${PBX_OUTBOUND_E164}'),
    ' same => n,Hangup()',
    'exten => _+972X.,1,NoOp(PBX outbound E164 ${EXTEN})',
    stasisOutboundLine(tenantSlug, '${EXTEN}'),
    ' same => n,Hangup()',
    'exten => _972X.,1,NoOp(PBX outbound 972 ${EXTEN})',
    ' same => n,Set(PBX_OUTBOUND_E164=+${EXTEN})',
    stasisOutboundLine(tenantSlug, '${PBX_OUTBOUND_E164}'),
    ' same => n,Hangup()',
  );
}

export function normalizeIsraeliLocalToE164(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (raw.startsWith('+972')) {
    return `+972${digits.slice(3)}`;
  }
  if (digits.startsWith('972')) {
    return `+${digits}`;
  }
  if (digits.startsWith('0') && digits.length >= 9) {
    return `+972${digits.slice(1)}`;
  }
  return null;
}
