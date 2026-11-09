import assert from 'node:assert/strict';
import test from 'node:test';
import { generateWebAuthnChallengeToken, getWebAuthnConfig, verifyWebAuthnChallengeToken } from './webauthn.ts';

const env = { JWT_SECRET: '0123456789abcdef0123456789abcdef' };
const payload = {
  purpose: 'authentication',
  challenge: 'challenge-value',
  userId: 'user-1',
  username: 'admin',
  sessionVersion: 3,
};

test('challenge token round trip binds purpose and identity', async () => {
  const token = await generateWebAuthnChallengeToken(payload, env);
  assert.deepEqual(await verifyWebAuthnChallengeToken(token, 'authentication', env), payload);
  assert.equal(await verifyWebAuthnChallengeToken(token, 'registration', env), null);
});

test('challenge token rejects a different secret and expired tokens', async () => {
  const token = await generateWebAuthnChallengeToken(payload, env);
  assert.equal(await verifyWebAuthnChallengeToken(token, 'authentication', {
    JWT_SECRET: 'fedcba9876543210fedcba9876543210',
  }), null);

  const expired = await generateWebAuthnChallengeToken(payload, env, Date.now() - 10 * 60 * 1000);
  assert.equal(await verifyWebAuthnChallengeToken(expired, 'authentication', env), null);
});

test('WebAuthn config uses the request hostname and origin', () => {
  assert.deepEqual(getWebAuthnConfig('https://monitor.example.com/api/login/passkey/options'), {
    rpID: 'monitor.example.com',
    rpName: 'CF VPS Monitor',
    origin: 'https://monitor.example.com',
  });
  assert.equal(getWebAuthnConfig('http://localhost:8787/api').rpID, 'localhost');
  assert.throws(() => getWebAuthnConfig('http://example.com/api'));
});
