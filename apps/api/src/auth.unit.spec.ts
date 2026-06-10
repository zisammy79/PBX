import { describe, expect, it } from 'vitest';
import { jwtVerify, SignJWT } from 'jose';

describe('JWT expiration', () => {
  it('rejects expired access tokens', async () => {
    const secret = new TextEncoder().encode('a'.repeat(32));
    const expired = await new SignJWT({
      sub: '11111111-1111-1111-1111-111111111111',
      email: 'test@test.local',
      type: 'access',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('0s')
      .sign(secret);

    await expect(jwtVerify(expired, secret)).rejects.toThrow();
  });
});
