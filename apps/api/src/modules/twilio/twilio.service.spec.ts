import { describe, expect, it } from 'vitest';
import { isTwilioConfigured, requireTwilioConfig, type AppConfig } from '../../config.js';
import { assertIsraeliE164, normalizeIsraeliE164, parseTerminationHost } from './twilio-israel.js';
import { redactE164, redactSid } from './twilio-redact.js';

const baseConfig = {
  nodeEnv: 'test',
  logLevel: 'info',
  apiPort: 3001,
  publicApiUrl: 'http://localhost:3001',
  publicWebUrl: 'http://localhost:3000',
  databaseUrl: 'postgresql://pbx:pbx@localhost:5433/pbx',
  redisUrl: 'redis://localhost:6379',
  natsUrl: 'nats://localhost:4222',
  jwtSecret: 'x'.repeat(32),
  jwtAccessTtlSeconds: 900,
  jwtRefreshTtlSeconds: 604800,
  encryptionMasterKey: 'a'.repeat(64),
  version: '0.1.0',
  telephonyEnabled: false,
  asteriskAriUsername: 'pbx_ari',
  sipUdpPort: 5060,
  s3Region: 'us-east-1',
  s3ForcePathStyle: true,
  recordingPlaybackTtlSeconds: 300,
  callRecordingStorageBackend: 'local' as const,
  callRecordingLocalRoot: '/tmp',
  twilioDefaultCountry: 'IL',
  twilioDefaultNumberType: 'local' as const,
  twilioNumberAssignmentMode: 'manual_or_auto' as const,
} as AppConfig;

describe('twilio config', () => {
  it('fails cleanly when env missing', () => {
    expect(isTwilioConfigured(baseConfig)).toBe(false);
    expect(() => requireTwilioConfig(baseConfig)).toThrow(/Twilio is not configured/);
  });

  it('accepts full twilio config', () => {
    const cfg: AppConfig = {
      ...baseConfig,
      twilioAccountSid: 'AC123',
      twilioApiKeySid: 'SK123',
      twilioApiKeySecret: 'secret',
      twilioTrunkSid: 'TK123',
      twilioTerminationSipUri: 'sip:foo.pstn.twilio.com',
      pbxPublicIp: '165.245.254.97',
      pbxOriginationSipUri: 'sip:165.245.254.97:5060',
    };
    expect(isTwilioConfigured(cfg)).toBe(true);
    expect(requireTwilioConfig(cfg).defaultCountry).toBe('IL');
  });
});

describe('twilio redaction', () => {
  it('redacts account sid and e164', () => {
    expect(redactSid('ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')).toBe('****aaaa');
    expect(redactE164('+972212345678')).toBe('+972****78');
  });
});

describe('israeli e164', () => {
  it('normalizes local landline', () => {
    expect(normalizeIsraeliE164('02-1234567')).toBe('+97221234567');
  });

  it('validates israeli e164', () => {
    expect(assertIsraeliE164('+97221234567')).toBe('+97221234567');
  });

  it('parses termination host', () => {
    expect(parseTerminationHost('sip:foo.pstn.twilio.com')).toEqual({ host: 'foo.pstn.twilio.com', port: 5060 });
  });
});
