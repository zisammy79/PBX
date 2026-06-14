import { createHash } from 'node:crypto';
import { redactObject } from '@pbx/shared';
import type {
  ConfigManifest,
  GeneratedTelephonyConfig,
  TelephonyAiAgentRecord,
  TelephonyExtensionRecord,
  TelephonyTenantRecord,
} from './types.js';

const SAFE_CODECS = ['ulaw', 'alaw'] as const;
const STASIS_APP = 'pbx-platform';

function assertSafeIdentifier(value: string, label: string): void {
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
}

function assertExtensionNumber(value: string): void {
  if (!/^[0-9]{3,6}$/.test(value)) {
    throw new Error(`Invalid extension number: ${value}`);
  }
}

export function generateTelephonyConfig(
  tenants: TelephonyTenantRecord[],
  extensions: TelephonyExtensionRecord[],
  aiAgents: TelephonyAiAgentRecord[] = [],
  version?: string,
): GeneratedTelephonyConfig {
  const activeTenants = tenants.filter((t) => t.status === 'active');
  const tenantSlugSet = new Set(activeTenants.map((t) => t.slug));

  const activeExtensions = extensions.filter(
    (e) => e.status === 'active' && tenantSlugSet.has(e.tenantSlug),
  );

  const endpointIds = new Set<string>();
  const aorIds = new Set<string>();
  for (const ext of activeExtensions) {
    assertSafeIdentifier(ext.asteriskEndpointId, 'endpoint id');
    assertSafeIdentifier(ext.sipUsername, 'sip username');
    assertExtensionNumber(ext.extensionNumber);
    if (endpointIds.has(ext.asteriskEndpointId)) {
      throw new Error(`Duplicate endpoint id: ${ext.asteriskEndpointId}`);
    }
    if (aorIds.has(ext.sipUsername)) {
      throw new Error(`Duplicate aor id: ${ext.sipUsername}`);
    }
    endpointIds.add(ext.asteriskEndpointId);
    aorIds.add(ext.sipUsername);
  }

  const pjsipLines: string[] = [
    '; PBX generated PJSIP tenant endpoints — do not edit manually',
    `; version=${version ?? 'draft'}`,
    '; secrets redacted in logs — file mode 0600 required',
  ];

  const dialplanLines: string[] = [
    '; PBX generated tenant dialplan contexts',
    `; version=${version ?? 'draft'}`,
  ];

  const activeAiAgents = aiAgents.filter(
    (a) => a.status === 'active' && tenantSlugSet.has(a.tenantSlug),
  );

  for (const tenant of activeTenants) {
    assertSafeIdentifier(tenant.slug, 'tenant slug');
    assertSafeIdentifier(tenant.asteriskContext, 'asterisk context');

    dialplanLines.push(
      '',
      `[${tenant.asteriskContext}]`,
    );

    const tenantAi = activeAiAgents.filter((a) => a.tenantSlug === tenant.slug);
    for (const agent of tenantAi) {
      assertExtensionNumber(agent.routeNumber);
      dialplanLines.push(
        `exten => ${agent.routeNumber},1,NoOp(PBX AI route ${agent.routeNumber} agent ${agent.agentName})`,
        ` same => n,Stasis(${STASIS_APP},${tenant.slug},\${CALLERID(num)},ai,${agent.routeNumber})`,
        ' same => n,Hangup()',
      );
    }

    dialplanLines.push(
      'exten => _XXXX,1,NoOp(PBX internal ${CALLERID(num)} -> ${EXTEN} tenant ' +
        tenant.slug +
        ')',
      ` same => n,Stasis(${STASIS_APP},${tenant.slug},\${CALLERID(num)},\${EXTEN})`,
      ' same => n,Hangup()',
    );
  }

  for (const ext of activeExtensions) {
    const ep = ext.asteriskEndpointId;
    const aor = ext.sipUsername;
    const auth = `${aor}_auth`;
    pjsipLines.push(
      '',
      `; extension ${ext.extensionNumber} tenant ${ext.tenantSlug}`,
      `[${ep}]`,
      'type=endpoint',
      `context=${ext.asteriskContext}`,
      'transport=transport-udp',
      `auth=${auth}`,
      `aors=${aor}`,
      `callerid=${ext.displayName} <${ext.extensionNumber}>`,
      `from_user=${ext.sipUsername}`,
      'disallow=all',
      `allow=${SAFE_CODECS.join(',')}`,
      'direct_media=no',
      'rtp_symmetric=yes',
      'force_rport=yes',
      'rewrite_contact=yes',
      'rtp_keepalive=30',
      '',
      `[${auth}]`,
      'type=auth',
      'auth_type=userpass',
      'realm=asterisk',
      `username=${ext.sipUsername}`,
      `password=${ext.sipSecret}`,
      '',
      `[${aor}]`,
      'type=aor',
      'max_contacts=1',
      'remove_existing=yes',
      'remove_unavailable=yes',
      'default_expiration=3600',
      'minimum_expiration=60',
      'maximum_expiration=7200',
      'qualify_frequency=30',
      'qualify_timeout=3',
      '',
      `[${ep}-identify]`,
      'type=identify',
      `endpoint=${ep}`,
      `match_header=From:/${ext.sipUsername}@/`,
    );
  }

  const generatedAt = new Date().toISOString();
  const configVersion = version ?? generatedAt;
  const pjsipTenants = `${pjsipLines.join('\n')}\n`;
  const extensionsTenants = `${dialplanLines.join('\n')}\n`;
  const checksum = createHash('sha256')
    .update(pjsipTenants)
    .update(extensionsTenants)
    .digest('hex');

  const manifest: ConfigManifest = {
    version: configVersion,
    generatedAt,
    tenantIds: activeTenants.map((t) => t.tenantId),
    extensionCount: activeExtensions.length,
    checksum,
  };

  return {
    version: configVersion,
    generatedAt,
    tenantIds: manifest.tenantIds,
    pjsipTenants,
    extensionsTenants,
    manifest,
  };
}

export function redactGeneratedConfig(config: GeneratedTelephonyConfig): GeneratedTelephonyConfig {
  return {
    ...config,
    pjsipTenants: config.pjsipTenants.replace(/password=.*$/gm, 'password=[REDACTED]'),
    manifest: config.manifest,
  };
}

export function redactForAudit(payload: unknown): unknown {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    return redactObject(payload as Record<string, unknown>);
  }
  return payload;
}
