import { describe, expect, it } from 'vitest';
import {
  formatApiKey,
  generateApiKeyPrefix,
  generateApiKeySecret,
  hashApiKeySecret,
  parseApiKeyToken,
  verifyApiKeySecret,
} from './api-key.js';

describe('api-key', () => {
  it('generates and verifies hashed secrets', () => {
    const secret = generateApiKeySecret();
    const hash = hashApiKeySecret(secret);
    expect(verifyApiKeySecret(secret, hash)).toBe(true);
    expect(verifyApiKeySecret('wrong', hash)).toBe(false);
  });

  it('parses formatted token', () => {
    const prefix = generateApiKeyPrefix();
    const secret = generateApiKeySecret();
    const token = formatApiKey(prefix, secret);
    expect(parseApiKeyToken(token)).toEqual({ prefix, secret });
    expect(parseApiKeyToken('not-a-key')).toBeNull();
  });

  it('never embeds secret in prefix', () => {
    const prefix = generateApiKeyPrefix();
    const secret = generateApiKeySecret();
    const token = formatApiKey(prefix, secret);
    expect(token.startsWith('pbx_live_')).toBe(true);
    expect(token.includes(prefix)).toBe(true);
  });
});
