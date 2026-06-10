import { createHash } from 'node:crypto';
import type {
  GeneratedTrunkConfig,
  TelephonyInboundRouteRecord,
  TelephonyOutboundRouteRecord,
  TelephonyTrunkRecord,
} from './trunk.types.js';

const SAFE_CODECS = ['ulaw', 'alaw'] as const;
const STASIS_APP = 'pbx-platform';

function assertSafeIdentifier(value: string, label: string): void {
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
}

function assertE164(value: string): void {
  if (!/^\+[1-9]\d{6,14}$/.test(value)) {
    throw new Error(`Invalid E.164: ${value}`);
  }
}

export function normalizeOutboundNumber(raw: string, defaultCountry = '1'): string {
  const digits = raw.replace(/\D/g, '');
  if (raw.startsWith('+')) {
    return `+${digits}`;
  }
  if (digits.length === 10 && defaultCountry === '1') {
    return `+1${digits}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }
  return `+${digits}`;
}

export function validateDestinationCountry(
  e164: string,
  allowed: string[],
): { allowed: boolean; country?: string } {
  if (allowed.length === 0) {
    return { allowed: true };
  }
  const digits = e164.replace(/\D/g, '');
  const prefixes: Record<string, string[]> = {
    US: ['1'],
    CA: ['1'],
    GB: ['44'],
  };
  for (const country of allowed) {
    const codes = prefixes[country] ?? [country.replace(/\D/g, '')];
    for (const code of codes) {
      if (digits.startsWith(code)) {
        return { allowed: true, country };
      }
    }
  }
  return { allowed: false };
}

export function generateTrunkConfig(
  trunks: TelephonyTrunkRecord[],
  inbound: TelephonyInboundRouteRecord[],
  outbound: TelephonyOutboundRouteRecord[],
): GeneratedTrunkConfig {
  const activeTrunks = trunks.filter((t) => t.isActive);
  const pjsipLines: string[] = [
    '; PBX generated PSTN trunk endpoints — do not edit manually',
    '; secrets redacted in logs — file mode 0600 required',
  ];
  const inboundLines: string[] = ['; PBX generated inbound PSTN dialplan'];
  const outboundLines: string[] = ['; PBX generated outbound PSTN dialplan'];

  for (const trunk of activeTrunks) {
    assertSafeIdentifier(trunk.asteriskTrunkId, 'trunk id');
    assertSafeIdentifier(trunk.tenantSlug, 'tenant slug');
    const ep = trunk.asteriskTrunkId;
    const auth = `${ep}_auth`;
    const aor = `${ep}_aor`;
    const reg = `${ep}_reg`;
    const transport = trunk.transport === 'tls' ? 'transport-tls' : trunk.transport === 'tcp' ? 'transport-tcp' : 'transport-udp';
    const codecs = trunk.allowedCodecs.filter((c) => (SAFE_CODECS as readonly string[]).includes(c));
    const allow = (codecs.length > 0 ? codecs : ['ulaw']).join(',');

    pjsipLines.push(
      '',
      `; trunk ${trunk.name} tenant ${trunk.tenantSlug}`,
      `[${ep}]`,
      'type=endpoint',
      `context=from-pstn-${trunk.tenantSlug}`,
      `transport=${transport}`,
      `disallow=all`,
      `allow=${allow}`,
      'direct_media=no',
      'rtp_symmetric=yes',
      'force_rport=yes',
      `dtmf_mode=${trunk.dtmfMode}`,
    );

    if (trunk.authMode === 'registration') {
      if (!trunk.registrar || !trunk.username || !trunk.password) {
        throw new Error(`Trunk ${trunk.slug} registration requires registrar, username, password`);
      }
      pjsipLines.push(
        `outbound_auth=${auth}`,
        `aors=${aor}`,
        '',
        `[${auth}]`,
        'type=auth',
        'auth_type=userpass',
        `username=${trunk.username}`,
        `password=${trunk.password}`,
        '',
        `[${aor}]`,
        'type=aor',
        'contact=sip:sip.invalid',
        '',
        `[${reg}]`,
        'type=registration',
        `outbound_auth=${auth}`,
        `server_uri=sip:${trunk.registrar}`,
        `client_uri=sip:${trunk.username}@${trunk.registrar}`,
        `contact_user=${trunk.username}`,
        'retry_interval=60',
        'forbidden_retry_interval=600',
        'expiration=3600',
      );
      if (trunk.outboundProxy) {
        pjsipLines.push(`outbound_proxy=sip:${trunk.outboundProxy}`);
      }
    } else {
      pjsipLines.push(`identify_by=ip`, `[${ep}-identify]`, 'type=identify', `endpoint=${ep}`, 'match=0.0.0.0/0');
    }

    if (trunk.assignedDid) {
      assertE164(trunk.assignedDid);
    }
  }

  for (const route of inbound) {
    assertSafeIdentifier(route.tenantSlug, 'tenant slug');
    inboundLines.push(
      '',
      `[from-pstn-${route.tenantSlug}]`,
      `exten => ${route.didPattern},1,NoOp(PSTN inbound ${route.didPattern})`,
      ` same => n,Set(PBX_TENANT=${route.tenantSlug})`,
      ` same => n,Set(PBX_TRUNK=${route.trunkAsteriskId})`,
      route.destinationType === 'extension'
        ? ` same => n,Stasis(${STASIS_APP},${route.tenantSlug},\${CALLERID(num)},${route.destinationValue})`
        : ` same => n,Stasis(${STASIS_APP},${route.tenantSlug},\${CALLERID(num)},ai,${route.destinationValue})`,
      ' same => n,Hangup()',
    );
  }

  for (const route of outbound) {
    assertSafeIdentifier(route.tenantSlug, 'tenant slug');
    outboundLines.push(
      '',
      `[outbound-pstn-${route.tenantSlug}]`,
      `exten => ${route.pattern},1,NoOp(PSTN outbound \${EXTEN})`,
      ` same => n,Set(CALLERID(num)=${route.callerId})`,
      ` same => n,Dial(PJSIP/\${EXTEN}@${route.trunkAsteriskId},,g)` ,
      ' same => n,Hangup()',
    );
  }

  const pjsipTrunks = `${pjsipLines.join('\n')}\n`;
  const inboundDialplan = `${inboundLines.join('\n')}\n`;
  const outboundDialplan = `${outboundLines.join('\n')}\n`;
  const checksum = createHash('sha256')
    .update(pjsipTrunks)
    .update(inboundDialplan)
    .update(outboundDialplan)
    .digest('hex');

  return {
    pjsipTrunks,
    inboundDialplan,
    outboundDialplan,
    trunkCount: activeTrunks.length,
    checksum,
  };
}

export function redactTrunkConfig(config: GeneratedTrunkConfig): GeneratedTrunkConfig {
  return {
    ...config,
    pjsipTrunks: config.pjsipTrunks.replace(/password=.*$/gm, 'password=[REDACTED]'),
  };
}
