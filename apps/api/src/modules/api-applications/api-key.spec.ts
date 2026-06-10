import { describe, expect, it } from 'vitest';
import {
  formatApiKey,
  generateApiKeyPrefix,
  generateApiKeySecret,
  hashApiKeySecret,
  parseApiKeyToken,
  verifyApiKeySecret,
} from '@pbx/shared';

describe('api key material', () => {
  it('hashes and verifies secrets without storing plaintext', () => {
    const secret = generateApiKeySecret();
    const hash = hashApiKeySecret(secret);
    expect(hash).not.toContain(secret);
    expect(verifyApiKeySecret(secret, hash)).toBe(true);
  });

  it('uses pbx_live prefix format', () => {
    const token = formatApiKey(generateApiKeyPrefix(), generateApiKeySecret());
    expect(token.startsWith('pbx_live_')).toBe(true);
    expect(parseApiKeyToken(token)).not.toBeNull();
  });
});
