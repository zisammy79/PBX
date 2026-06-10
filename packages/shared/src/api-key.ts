import { randomBytes } from 'node:crypto';
import { hashPassword, verifyPassword } from './crypto.js';

const API_KEY_PREFIX = 'pbx_live';

export function generateApiKeyPrefix(): string {
  return randomBytes(9).toString('base64url').slice(0, 12);
}

export function generateApiKeySecret(): string {
  return randomBytes(24).toString('base64url');
}

export function formatApiKey(prefix: string, secret: string): string {
  return `${API_KEY_PREFIX}_${prefix}_${secret}`;
}

export function parseApiKeyToken(token: string): { prefix: string; secret: string } | null {
  if (!token.startsWith(`${API_KEY_PREFIX}_`)) return null;
  const rest = token.slice(API_KEY_PREFIX.length + 1);
  if (rest.length < 14 || rest[12] !== '_') return null;
  const prefix = rest.slice(0, 12);
  const secret = rest.slice(13);
  if (!prefix || !secret) return null;
  return { prefix, secret };
}

export function hashApiKeySecret(secret: string): string {
  return hashPassword(secret);
}

export function verifyApiKeySecret(secret: string, storedHash: string): boolean {
  return verifyPassword(secret, storedHash);
}

export function isApiKeyToken(token: string): boolean {
  return token.startsWith(`${API_KEY_PREFIX}_`);
}
