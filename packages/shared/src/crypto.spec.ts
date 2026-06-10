import { describe, expect, it } from 'vitest';
import {
  decryptSecret,
  encryptSecret,
  hashPassword,
  verifyPassword,
} from '../src/crypto.js';
import { redactObject, redactSecrets } from '../src/redact.js';

const TEST_KEY = 'a'.repeat(64);
const OTHER_KEY = 'b'.repeat(64);

describe('encryption behavior', () => {
  it('encrypts SIP secrets with distinct ciphertext for same plaintext', () => {
    const a = encryptSecret('same-secret', TEST_KEY);
    const b = encryptSecret('same-secret', TEST_KEY);
    expect(a).not.toBe(b);
    expect(decryptSecret(a, TEST_KEY)).toBe('same-secret');
    expect(decryptSecret(b, TEST_KEY)).toBe('same-secret');
  });

  it('rejects modified ciphertext', () => {
    const encrypted = encryptSecret('secret-value', TEST_KEY);
    const parts = encrypted.split(':');
    parts[3] = `${parts[3]!.slice(0, -2)}ff`;
    expect(() => decryptSecret(parts.join(':'), TEST_KEY)).toThrow();
  });

  it('rejects wrong encryption key', () => {
    const encrypted = encryptSecret('secret-value', TEST_KEY);
    expect(() => decryptSecret(encrypted, OTHER_KEY)).toThrow();
  });

  it('stores password hashes verifiably', () => {
    const hash = hashPassword('tenant-owner-password-123');
    expect(verifyPassword('tenant-owner-password-123', hash)).toBe(true);
    expect(verifyPassword('wrong', hash)).toBe(false);
  });
});

describe('secret redaction', () => {
  it('redacts secret patterns in strings', () => {
    const input = 'password=supersecret api_key=abc123 Bearer deadbeef';
    const redacted = redactSecrets(input);
    expect(redacted).not.toContain('supersecret');
    expect(redacted).not.toContain('deadbeef');
  });

  it('redacts secret fields in objects', () => {
    const redacted = redactObject({
      username: 'ext1001',
      secret: 'plain-sip-secret',
      password: 'x',
    });
    expect(redacted.secret).toBe('[REDACTED]');
    expect(redacted.password).toBe('[REDACTED]');
    expect(redacted.username).toBe('ext1001');
  });
});
