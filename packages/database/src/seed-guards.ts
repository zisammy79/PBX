import { generateSecureToken } from '@pbx/shared';

export function assertDevSeedAllowed(): void {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const allowDevSeed = process.env.ALLOW_DEV_SEED === 'true';

  if (nodeEnv === 'production') {
    throw new Error('Refusing to seed: NODE_ENV=production');
  }

  if (!allowDevSeed) {
    throw new Error(
      'Refusing to seed: set ALLOW_DEV_SEED=true for local development seeding only',
    );
  }
}

export function assertProductionSeedConfigSafe(): void {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEV_SEED === 'true') {
    throw new Error('Refusing to start: ALLOW_DEV_SEED must not be enabled in production');
  }
}

export function resolveDevAdminPassword(): string {
  const configured = process.env.DEV_ADMIN_PASSWORD?.trim();
  if (configured && configured.length >= 12) {
    return configured;
  }
  return generateSecureToken(16);
}
