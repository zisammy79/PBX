import { createSocket } from 'node:dgram';
import { randomBytes } from 'node:crypto';

export type SipNetworkValidationResult = {
  status:
    | 'NOT_TESTED'
    | 'REGISTERED'
    | 'OPTIONS_REACHABLE'
    | 'AUTHENTICATION_FAILED'
    | 'UNREACHABLE'
    | 'INVALID_CONFIGURATION';
  sanitizedError?: string;
  responseCode?: number;
  roundTripMs?: number;
  registrationState?: string;
};

function parseHostPort(target: string, defaultPort: number): { host: string; port: number } {
  const trimmed = target.trim();
  if (!trimmed) return { host: '', port: defaultPort };
  if (trimmed.includes(':')) {
    const [host, portRaw] = trimmed.split(':');
    const port = Number(portRaw);
    return { host: host ?? '', port: Number.isFinite(port) ? port : defaultPort };
  }
  return { host: trimmed, port: defaultPort };
}

function sipBranch() {
  return `z9hG4bK${randomBytes(8).toString('hex')}`;
}

function buildOptionsRequest(registrar: string, transport: string): string {
  const branch = sipBranch();
  const callId = `${randomBytes(8).toString('hex')}@pbx.local`;
  const tag = randomBytes(4).toString('hex');
  const viaTransport = transport.toUpperCase() === 'TCP' ? 'TCP' : 'UDP';
  return [
    `OPTIONS sip:${registrar} SIP/2.0`,
    `Via: SIP/2.0/${viaTransport} pbx.local;branch=${branch}`,
    `From: <sip:probe@pbx.local>;tag=${tag}`,
    `To: <sip:probe@${registrar}>`,
    `Call-ID: ${callId}`,
    'CSeq: 1 OPTIONS',
    'Max-Forwards: 70',
    'User-Agent: PBX-Integration-Validator',
    'Content-Length: 0',
    '',
    '',
  ].join('\r\n');
}

function buildRegisterRequest(registrar: string, username: string, transport: string): string {
  const branch = sipBranch();
  const callId = `${randomBytes(8).toString('hex')}@pbx.local`;
  const tag = randomBytes(4).toString('hex');
  const viaTransport = transport.toUpperCase() === 'TCP' ? 'TCP' : 'UDP';
  return [
    `REGISTER sip:${registrar} SIP/2.0`,
    `Via: SIP/2.0/${viaTransport} pbx.local;branch=${branch}`,
    `From: <sip:${username}@${registrar}>;tag=${tag}`,
    `To: <sip:${username}@${registrar}>`,
    `Call-ID: ${callId}`,
    'CSeq: 1 REGISTER',
    'Contact: <sip:probe@pbx.local>',
    'Max-Forwards: 70',
    'Expires: 60',
    'User-Agent: PBX-Integration-Validator',
    'Content-Length: 0',
    '',
    '',
  ].join('\r\n');
}

function parseSipStatus(response: string): number | undefined {
  const first = response.split('\r\n')[0] ?? '';
  const match = /^SIP\/2\.0\s+(\d{3})/.exec(first);
  return match ? Number(match[1]) : undefined;
}

async function sendSipProbe(
  message: string,
  host: string,
  port: number,
  timeoutMs: number,
): Promise<{ response: string; roundTripMs: number } | null> {
  if (!host) return null;
  return new Promise((resolve) => {
    const socket = createSocket('udp4');
    const started = Date.now();
    let settled = false;

    const finish = (result: { response: string; roundTripMs: number } | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.close();
      resolve(result);
    };

    const timer = setTimeout(() => finish(null), timeoutMs);

    socket.on('message', (buf) => {
      finish({ response: buf.toString('utf8'), roundTripMs: Date.now() - started });
    });
    socket.on('error', () => finish(null));

    socket.send(Buffer.from(message), port, host, (err) => {
      if (err) finish(null);
    });
  });
}

export async function validateSipNetwork(
  secrets: Record<string, string>,
  config: Record<string, unknown>,
  timeoutMs = 5000,
): Promise<SipNetworkValidationResult> {
  const registrar = String(config.registrar ?? config.outboundProxy ?? '').trim();
  if (!registrar) {
    return { status: 'INVALID_CONFIGURATION', sanitizedError: 'SIP registrar required for network validation' };
  }

  const transport = String(config.transport ?? 'udp').toLowerCase();
  if (transport !== 'udp') {
    return {
      status: 'NOT_TESTED',
      sanitizedError: 'Network validation currently supports UDP transport only',
    };
  }

  const { host, port } = parseHostPort(registrar, 5060);
  const authMode = String(config.authMode ?? 'registration').toLowerCase();
  const username = secrets.username?.trim() ?? '';

  const message =
    authMode === 'registration' && username
      ? buildRegisterRequest(host || registrar, username, transport)
      : buildOptionsRequest(host || registrar, transport);

  const probe = await sendSipProbe(message, host, port, timeoutMs);
  if (!probe) {
    return { status: 'UNREACHABLE', sanitizedError: 'Carrier did not respond within timeout' };
  }

  const code = parseSipStatus(probe.response);
  if (authMode === 'registration') {
    if (code === 200) {
      return { status: 'REGISTERED', responseCode: code, roundTripMs: probe.roundTripMs, registrationState: 'registered' };
    }
    if (code === 401 || code === 407) {
      return {
        status: 'AUTHENTICATION_FAILED',
        responseCode: code,
        roundTripMs: probe.roundTripMs,
        registrationState: 'challenge_received',
        sanitizedError: 'Carrier responded with authentication challenge',
      };
    }
    return {
      status: 'UNREACHABLE',
      ...(code != null ? { responseCode: code } : {}),
      roundTripMs: probe.roundTripMs,
      sanitizedError: 'Unexpected registration response',
    };
  }

  if (code && code >= 200 && code < 300) {
    return { status: 'OPTIONS_REACHABLE', responseCode: code, roundTripMs: probe.roundTripMs };
  }
  if (code === 401 || code === 407) {
    return {
      status: 'OPTIONS_REACHABLE',
      responseCode: code,
      roundTripMs: probe.roundTripMs,
      sanitizedError: 'Carrier reachable — authentication challenge received',
    };
  }
  return {
    status: 'UNREACHABLE',
    ...(code != null ? { responseCode: code } : {}),
    roundTripMs: probe.roundTripMs,
    sanitizedError: 'Carrier returned unexpected SIP response',
  };
}

export function validateSipConfiguration(
  secrets: Record<string, string>,
  config: Record<string, unknown>,
): { status: 'CONFIGURATION_VALID' | 'INVALID_CONFIGURATION'; sanitizedError?: string } {
  const authMode = String(config.authMode ?? 'registration').toLowerCase();
  if (authMode === 'registration') {
    if (!secrets.username?.trim() || !secrets.password?.trim()) {
      return { status: 'INVALID_CONFIGURATION', sanitizedError: 'SIP username and password required' };
    }
    if (!String(config.registrar ?? '').trim()) {
      return { status: 'INVALID_CONFIGURATION', sanitizedError: 'SIP registrar required' };
    }
  }
  const transport = String(config.transport ?? 'udp').toLowerCase();
  if (!['udp', 'tcp', 'tls'].includes(transport)) {
    return { status: 'INVALID_CONFIGURATION', sanitizedError: 'Unsupported SIP transport' };
  }
  const registrar = String(config.registrar ?? '');
  if (registrar && !/^[a-zA-Z0-9.-]+(?::\d+)?$/.test(registrar)) {
    return { status: 'INVALID_CONFIGURATION', sanitizedError: 'Invalid registrar format' };
  }
  if (config.assignedDid && !/^\+?[0-9]{3,15}$/.test(String(config.assignedDid))) {
    return { status: 'INVALID_CONFIGURATION', sanitizedError: 'Invalid assigned DID format' };
  }
  return { status: 'CONFIGURATION_VALID' };
}
