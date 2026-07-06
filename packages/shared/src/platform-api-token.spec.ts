import { describe, expect, it } from 'vitest';
import {
  formatPlatformApiToken,
  generatePlatformApiTokenPrefix,
  generatePlatformApiTokenSecret,
  hashPlatformApiTokenSecret,
  isPlatformApiToken,
  parsePlatformApiToken,
  verifyPlatformApiTokenSecret,
} from './platform-api-token.js';

describe('platform api token material', () => {
  it('uses pbx_plat_live prefix format', () => {
    const token = formatPlatformApiToken(
      generatePlatformApiTokenPrefix(),
      generatePlatformApiTokenSecret(),
    );
    expect(token.startsWith('pbx_plat_live_')).toBe(true);
    expect(isPlatformApiToken(token)).toBe(true);
    expect(parsePlatformApiToken(token)).not.toBeNull();
  });

  it('hashes and verifies secrets without storing plaintext', () => {
    const secret = generatePlatformApiTokenSecret();
    const hash = hashPlatformApiTokenSecret(secret);
    expect(hash).not.toContain(secret);
    expect(verifyPlatformApiTokenSecret(secret, hash)).toBe(true);
  });

  it('does not treat tenant api keys as platform tokens', () => {
    expect(isPlatformApiToken('pbx_live_abcdefghij_abcdefghijklmnop')).toBe(false);
  });
});
