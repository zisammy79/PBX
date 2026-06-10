import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  assertDevSeedAllowed,
  assertProductionSeedConfigSafe,
  resolveDevAdminPassword,
} from '../src/seed-guards.js';

describe('seed guards', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('refuses seed in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.ALLOW_DEV_SEED = 'true';
    expect(() => assertDevSeedAllowed()).toThrow(/production/i);
  });

  it('refuses seed without ALLOW_DEV_SEED', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.ALLOW_DEV_SEED;
    expect(() => assertDevSeedAllowed()).toThrow(/ALLOW_DEV_SEED/);
  });

  it('allows seed in development with explicit flag', () => {
    process.env.NODE_ENV = 'development';
    process.env.ALLOW_DEV_SEED = 'true';
    expect(() => assertDevSeedAllowed()).not.toThrow();
  });

  it('refuses production startup with ALLOW_DEV_SEED', () => {
    process.env.NODE_ENV = 'production';
    process.env.ALLOW_DEV_SEED = 'true';
    expect(() => assertProductionSeedConfigSafe()).toThrow(/production/i);
  });

  it('generates random password when DEV_ADMIN_PASSWORD unset', () => {
    delete process.env.DEV_ADMIN_PASSWORD;
    const a = resolveDevAdminPassword();
    const b = resolveDevAdminPassword();
    expect(a.length).toBeGreaterThanOrEqual(16);
    expect(b.length).toBeGreaterThanOrEqual(16);
    expect(a).not.toBe(b);
  });
});
