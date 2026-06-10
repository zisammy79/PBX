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

export async function validateOutboundWebhookUrl(
  rawUrl: string,
  devAllowedHosts: string[] = [],
): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw validationError({ url: 'Invalid URL' });
  }

  if (parsed.protocol !== 'https:') {
    throw validationError({ url: 'HTTPS required for webhook endpoints' });
  }
  if (parsed.username || parsed.password) {
    throw validationError({ url: 'Credentials in URL are not allowed' });
  }

  const hostname = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw validationError({ url: 'Host is not allowed' });
  }

  const devAllowed = devAllowedHosts.map((h) => h.toLowerCase());
  const devHostAllowed = devAllowed.some((h) => hostname === h || hostname.endsWith(`.${h}`));

  const ipLiteral = isIP(hostname);
  if (ipLiteral && isPrivateIp(hostname) && !devHostAllowed) {
    throw validationError({ url: 'Private or loopback addresses are not allowed' });
  }

  if (!ipLiteral) {
    const records = await lookup(hostname, { all: true, verbatim: true });
    for (const record of records) {
      if (isPrivateIp(record.address) && !devHostAllowed) {
        throw validationError({ url: 'Host resolves to a private or loopback address' });
      }
    }
  }

  parsed.hash = '';
  return parsed.toString();
}
