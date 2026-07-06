import { randomBytes } from 'node:crypto';
import { hashPassword, verifyPassword } from './crypto.js';

/** Platform automation tokens — distinct from tenant API keys (`pbx_live_*`). */
export const PLATFORM_API_TOKEN_PREFIX = 'pbx_plat_live';

export function generatePlatformApiTokenPrefix(): string {
  return randomBytes(9).toString('base64url').slice(0, 12);
}

export function generatePlatformApiTokenSecret(): string {
  return randomBytes(24).toString('base64url');
}

export function formatPlatformApiToken(prefix: string, secret: string): string {
  return `${PLATFORM_API_TOKEN_PREFIX}_${prefix}_${secret}`;
}

export function parsePlatformApiToken(token: string): { prefix: string; secret: string } | null {
  if (!token.startsWith(`${PLATFORM_API_TOKEN_PREFIX}_`)) return null;
  const rest = token.slice(PLATFORM_API_TOKEN_PREFIX.length + 1);
  if (rest.length < 14 || rest[12] !== '_') return null;
  const prefix = rest.slice(0, 12);
  const secret = rest.slice(13);
  if (!prefix || !secret) return null;
  return { prefix, secret };
}

export function hashPlatformApiTokenSecret(secret: string): string {
  return hashPassword(secret);
}

export function verifyPlatformApiTokenSecret(secret: string, storedHash: string): boolean {
  return verifyPassword(secret, storedHash);
}

export function isPlatformApiToken(token: string): boolean {
  return token.startsWith(`${PLATFORM_API_TOKEN_PREFIX}_`);
}
