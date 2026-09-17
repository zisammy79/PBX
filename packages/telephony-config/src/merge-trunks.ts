import { createHash } from 'node:crypto';
import { appendInboundBlacklistChecks } from './callflow-dialplan.js';
import type { TelephonyBlacklistRecord } from './callflow.types.js';
import type { GeneratedTelephonyConfig } from './types.js';
import type { GeneratedTrunkConfig } from './trunk.types.js';

export function mergeTelephonyWithTrunks(
  base: GeneratedTelephonyConfig,
  trunks: GeneratedTrunkConfig,
  blacklist: TelephonyBlacklistRecord[] = [],
): GeneratedTelephonyConfig {
  if (trunks.trunkCount === 0) {
    return base;
  }

  const pjsipTenants = `${base.pjsipTenants.trimEnd()}\n\n${trunks.pjsipTrunks.trimEnd()}\n`;
  const inboundLines = trunks.inboundDialplan.trimEnd().split('\n');
  const blacklistByTenant = new Map<string, TelephonyBlacklistRecord[]>();
  for (const entry of blacklist) {
    const list = blacklistByTenant.get(entry.tenantSlug) ?? [];
    list.push(entry);
    blacklistByTenant.set(entry.tenantSlug, list);
  }
  for (const [tenantSlug, entries] of blacklistByTenant) {
    appendInboundBlacklistChecks(inboundLines, tenantSlug, entries);
  }

  const extensionsTenants = `${base.extensionsTenants.trimEnd()}\n\n${inboundLines.join('\n')}\n\n${trunks.outboundDialplan.trimEnd()}\n`;
  const checksum = createHash('sha256')
    .update(pjsipTenants)
    .update(extensionsTenants)
    .update(base.queuesTenants)
    .update(base.musiconholdTenants)
    .digest('hex');

  return {
    ...base,
    pjsipTenants,
    extensionsTenants,
    manifest: {
      ...base.manifest,
      checksum,
    },
  };
}
