import { createHash } from 'node:crypto';
import type { GeneratedTelephonyConfig } from './types.js';
import type { GeneratedTrunkConfig } from './trunk.types.js';

export function mergeTelephonyWithTrunks(
  base: GeneratedTelephonyConfig,
  trunks: GeneratedTrunkConfig,
): GeneratedTelephonyConfig {
  if (trunks.trunkCount === 0) {
    return base;
  }

  const pjsipTenants = `${base.pjsipTenants.trimEnd()}\n\n${trunks.pjsipTrunks.trimEnd()}\n`;
  const extensionsTenants = `${base.extensionsTenants.trimEnd()}\n\n${trunks.inboundDialplan.trimEnd()}\n\n${trunks.outboundDialplan.trimEnd()}\n`;
  const checksum = createHash('sha256').update(pjsipTenants).update(extensionsTenants).digest('hex');

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
