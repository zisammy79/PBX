import { validationError } from '@pbx/contracts';
import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';

const BLOCKED_HOSTNAMES = new Set(['localhost', 'metadata.google.internal']);
const PRIVATE_IPV4_RANGES = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
];

function isPrivateIp(ip: string): boolean {
  if (ip === '::1' || ip.startsWith('fe80:') || ip.startsWith('fc') || ip.startsWith('fd')) {
    return true;
  }
  if (isIP(ip) === 4) {
    return PRIVATE_IPV4_RANGES.some((re) => re.test(ip));
  }
  return false;
}

export async function validateHttpWebhookTarget(
  rawUrl: string,
  allowedHosts: string[],
): Promise<{ hostname: string; normalizedUrl: string }> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw validationError({ url: 'Invalid URL' });
  }
  if (parsed.protocol !== 'https:') {
    throw validationError({ url: 'HTTPS required for http_webhook' });
  }
  if (parsed.username || parsed.password) {
    throw validationError({ url: 'Credentials in URL are not allowed' });
  }
  const hostname = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw validationError({ url: 'Host is not allowed' });
  }
  const allowed = allowedHosts.map((h) => h.toLowerCase());
  const hostAllowed = allowed.some((h) => hostname === h || hostname.endsWith(`.${h}`));
  if (!hostAllowed) {
    throw validationError({ allowedHosts: 'Host not in tenant allowlist' });
  }

  const ipLiteral = isIP(hostname);
  if (ipLiteral && isPrivateIp(hostname)) {
    throw validationError({ url: 'Private or loopback addresses are not allowed' });
  }
  if (!ipLiteral) {
    try {
      const records = await lookup(hostname, { all: true, verbatim: true });
      for (const record of records) {
        if (isPrivateIp(record.address)) {
          throw validationError({ url: 'Host resolves to a private or loopback address' });
        }
      }
    } catch (err) {
      if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'VALIDATION_ERROR') {
        throw err;
      }
      throw validationError({ url: 'Host could not be resolved for SSRF validation' });
    }
  }

  parsed.hash = '';
  return { hostname, normalizedUrl: parsed.toString() };
}

export function validateHttpWebhookConfig(config: Record<string, unknown>) {
  const allowedHosts = config.allowedHosts;
  if (!Array.isArray(allowedHosts) || allowedHosts.length === 0) {
    throw validationError({ allowedHosts: 'At least one allowed host is required' });
  }
  for (const host of allowedHosts) {
    if (typeof host !== 'string' || host.length === 0 || host.includes('/')) {
      throw validationError({ allowedHosts: 'Invalid host entry' });
    }
  }
  if (config.url !== undefined && typeof config.url !== 'string') {
    throw validationError({ url: 'url must be a string when provided' });
  }
  return allowedHosts as string[];
}
