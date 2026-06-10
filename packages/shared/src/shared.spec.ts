import { describe, expect, it } from 'vitest';
import {
  decryptSecret,
  encryptSecret,
  hashPassword,
  verifyPassword,
} from '../src/crypto.js';
import { tenantAsteriskContext, tenantEndpointId } from '../src/tenant-prefix.js';

const TEST_KEY = 'a'.repeat(64);

describe('crypto', () => {
  it('hashes and verifies passwords', () => {
    const hash = hashPassword('test-password-123');
    expect(verifyPassword('test-password-123', hash)).toBe(true);
    expect(verifyPassword('wrong', hash)).toBe(false);
  });

  it('encrypts and decrypts secrets', () => {
    const encrypted = encryptSecret('my-api-key', TEST_KEY);
    expect(decryptSecret(encrypted, TEST_KEY)).toBe('my-api-key');
  });
});

describe('tenant-prefix', () => {
  it('generates tenant asterisk context', () => {
    expect(tenantAsteriskContext('acme-corp')).toBe('t_acme_corp');
  });

  it('generates tenant endpoint id', () => {
    expect(tenantEndpointId('acme', '1001')).toBe('acme_ext_1001');
  });
});
