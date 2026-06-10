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
