import { z } from 'zod';
import { assertProductionSeedConfigSafe } from '@pbx/database';

const ConfigSchema = z.object({
  nodeEnv: z.enum(['development', 'test', 'production']).default('development'),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  apiPort: z.coerce.number().int().default(3001),
  publicApiUrl: z.string().url(),
  publicWebUrl: z.string().url(),
  databaseUrl: z.string().min(1),
  databaseAppUrl: z.string().min(1).optional(),
  redisUrl: z.string().min(1),
  natsUrl: z.string().min(1),
  jwtSecret: z.string().min(32),
  jwtAccessTtlSeconds: z.coerce.number().int().default(900),
  jwtRefreshTtlSeconds: z.coerce.number().int().default(604800),
  encryptionMasterKey: z.string().length(64),
  version: z.string().default('0.1.0'),
  telephonyEnabled: z.coerce.boolean().default(false),
  asteriskAriUrl: z.string().url().optional(),
  asteriskAriUsername: z.string().default('pbx_ari'),
  asteriskAriPassword: z.string().optional(),
  repoRoot: z.string().optional(),
  sipPublicDomain: z.string().min(1).optional(),
  sipExternalSignalingAddress: z.string().min(1).optional(),
  sipExternalMediaAddress: z.string().min(1).optional(),
  sipExternalIp: z.string().min(1).optional(),
  sipUdpPort: z.coerce.number().int().min(1).max(65535).default(5060),
  s3Endpoint: z.string().url().optional(),
  s3AccessKey: z.string().min(1).optional(),
  s3SecretKey: z.string().min(1).optional(),
  s3Bucket: z.string().min(1).optional(),
  s3Region: z.string().default('us-east-1'),
  s3ForcePathStyle: z.coerce.boolean().default(true),
  recordingPlaybackTtlSeconds: z.coerce.number().int().min(60).max(3600).default(300),
  callRecordingStorageBackend: z.enum(['local', 's3']).default('local'),
  callRecordingLocalRoot: z.string().min(1).default('/var/lib/pbx/recordings'),
  twilioAccountSid: z.string().min(1).optional(),
  twilioApiKeySid: z.string().min(1).optional(),
  twilioApiKeySecret: z.string().min(1).optional(),
  twilioTrunkSid: z.string().min(1).optional(),
  twilioTerminationSipUri: z.string().min(1).optional(),
  twilioTestDid: z.string().regex(/^\+[1-9]\d{6,14}$/).optional(),
  pbxPublicIp: z.string().min(1).optional(),
  pbxOriginationSipUri: z.string().min(1).optional(),
  twilioDefaultCountry: z.string().length(2).default('IL'),
  twilioDefaultNumberType: z.enum(['local']).default('local'),
  twilioNumberAssignmentMode: z.enum(['manual', 'auto', 'manual_or_auto']).default('manual_or_auto'),
  twilioSipUsername: z.string().min(1).optional(),
  twilioSipPassword: z.string().min(1).optional(),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

export function loadConfig(): AppConfig {
  assertProductionSeedConfigSafe();

  const result = ConfigSchema.safeParse({
    nodeEnv: process.env.NODE_ENV,
    logLevel: process.env.LOG_LEVEL,
    apiPort: process.env.API_PORT,
    publicApiUrl: process.env.PUBLIC_API_URL,
    publicWebUrl: process.env.PUBLIC_WEB_URL,
    databaseUrl: process.env.DATABASE_URL,
    databaseAppUrl: process.env.DATABASE_APP_URL,
    redisUrl: process.env.REDIS_URL,
    natsUrl: process.env.NATS_URL,
    jwtSecret: process.env.JWT_SECRET,
    jwtAccessTtlSeconds: process.env.JWT_ACCESS_TTL_SECONDS,
    jwtRefreshTtlSeconds: process.env.JWT_REFRESH_TTL_SECONDS,
    encryptionMasterKey: process.env.ENCRYPTION_MASTER_KEY,
    version: process.env.APP_VERSION,
    telephonyEnabled: process.env.TELEPHONY_ENABLED,
    asteriskAriUrl: process.env.ASTERISK_ARI_URL,
    asteriskAriUsername: process.env.ASTERISK_ARI_USERNAME,
    asteriskAriPassword: process.env.ASTERISK_ARI_PASSWORD,
    repoRoot: process.env.PBX_REPO_ROOT,
    sipPublicDomain: process.env.SIP_PUBLIC_DOMAIN,
    sipExternalSignalingAddress: process.env.SIP_EXTERNAL_SIGNALING_ADDRESS,
    sipExternalMediaAddress: process.env.SIP_EXTERNAL_MEDIA_ADDRESS,
    sipExternalIp: process.env.SIP_EXTERNAL_IP,
    sipUdpPort: process.env.SIP_UDP_PUBLISH,
    s3Endpoint: process.env.S3_ENDPOINT,
    s3AccessKey: process.env.S3_ACCESS_KEY,
    s3SecretKey: process.env.S3_SECRET_KEY,
    s3Bucket: process.env.S3_BUCKET,
    s3Region: process.env.S3_REGION,
    s3ForcePathStyle: process.env.S3_FORCE_PATH_STYLE,
    recordingPlaybackTtlSeconds: process.env.RECORDING_PLAYBACK_TTL_SECONDS,
    callRecordingStorageBackend: process.env.CALL_RECORDING_STORAGE_BACKEND,
    callRecordingLocalRoot: process.env.CALL_RECORDING_LOCAL_ROOT,
    twilioAccountSid: process.env.TWILIO_ACCOUNT_SID,
    twilioApiKeySid: process.env.TWILIO_API_KEY_SID,
    twilioApiKeySecret: process.env.TWILIO_API_KEY_SECRET,
    twilioTrunkSid: process.env.TWILIO_TRUNK_SID,
    twilioTerminationSipUri: process.env.TWILIO_TERMINATION_SIP_URI,
    twilioTestDid: process.env.TWILIO_TEST_DID,
    pbxPublicIp: process.env.PBX_PUBLIC_IP,
    pbxOriginationSipUri: process.env.PBX_ORIGINATION_SIP_URI,
    twilioDefaultCountry: process.env.TWILIO_DEFAULT_COUNTRY,
    twilioDefaultNumberType: process.env.TWILIO_DEFAULT_NUMBER_TYPE,
    twilioNumberAssignmentMode: process.env.TWILIO_NUMBER_ASSIGNMENT_MODE,
    twilioSipUsername: process.env.TWILIO_SIP_USERNAME,
    twilioSipPassword: process.env.TWILIO_SIP_PASSWORD,
  });

  if (!result.success) {
    console.error('Invalid configuration:', result.error.flatten());
    process.exit(1);
  }

  if (result.data.nodeEnv === 'production') {
    if (result.data.jwtSecret.includes('change-me')) {
      console.error('Refusing to start: JWT_SECRET must be set for production');
      process.exit(1);
    }
    if (result.data.encryptionMasterKey.includes('change-me')) {
      console.error('Refusing to start: ENCRYPTION_MASTER_KEY must be set for production');
      process.exit(1);
    }
  }

  return result.data;
}

export function resolveDatabaseUrl(config: AppConfig): string {
  return config.databaseAppUrl ?? config.databaseUrl;
}

export type TwilioConfig = {
  accountSid: string;
  apiKeySid: string;
  apiKeySecret: string;
  trunkSid: string;
  terminationSipUri: string;
  testDid?: string | undefined;
  publicIp: string;
  originationSipUri: string;
  defaultCountry: string;
  defaultNumberType: 'local';
  numberAssignmentMode: 'manual' | 'auto' | 'manual_or_auto';
  sipUsername?: string | undefined;
  sipPassword?: string | undefined;
};

export function isTwilioConfigured(config: AppConfig): config is AppConfig & TwilioConfig {
  return Boolean(
    config.twilioAccountSid &&
      config.twilioApiKeySid &&
      config.twilioApiKeySecret &&
      config.twilioTrunkSid &&
      config.twilioTerminationSipUri &&
      config.pbxPublicIp &&
      config.pbxOriginationSipUri,
  );
}

export function requireTwilioConfig(config: AppConfig): TwilioConfig {
  if (!isTwilioConfigured(config)) {
    throw new Error(
      'Twilio is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET, TWILIO_TRUNK_SID, TWILIO_TERMINATION_SIP_URI, PBX_PUBLIC_IP, and PBX_ORIGINATION_SIP_URI.',
    );
  }
  return {
    accountSid: config.twilioAccountSid!,
    apiKeySid: config.twilioApiKeySid!,
    apiKeySecret: config.twilioApiKeySecret!,
    trunkSid: config.twilioTrunkSid!,
    terminationSipUri: config.twilioTerminationSipUri!,
    testDid: config.twilioTestDid,
    publicIp: config.pbxPublicIp!,
    originationSipUri: config.pbxOriginationSipUri!,
    defaultCountry: config.twilioDefaultCountry,
    defaultNumberType: config.twilioDefaultNumberType,
    numberAssignmentMode: config.twilioNumberAssignmentMode,
    sipUsername: config.twilioSipUsername,
    sipPassword: config.twilioSipPassword,
  };
}
