import assert from 'node:assert/strict';
import test from 'node:test';
import { sign } from 'hono/jwt';
import { generateToken, verifyAdminToken } from './jwt.ts';
import { generateMfaToken } from './mfa-token.ts';
import { generateWebAuthnChallengeToken } from './webauthn.ts';

const env = { JWT_SECRET: 'TEST_JWT_SECRET_PLACEHOLDER_FOR_UNIT_TESTS_ONLY_123456' };
const identity = {
  userId: 'user-1',
  username: 'admin',
  sessionVersion: 3,
};

test('round-trips a session token', async () => {
  const token = await generateToken(identity.userId, identity.username, identity.sessionVersion, env);
  assert.deepEqual(await verifyAdminToken(token, env), identity);
});

test('rejects MFA login and step-up tokens as admin sessions', async () => {
  for (const purpose of ['mfa-login', 'mfa-step-up']) {
    const token = await generateMfaToken({ ...identity, purpose }, env);
    assert.equal(await verifyAdminToken(token, env), null);
  }
});

test('rejects WebAuthn challenge tokens as admin sessions', async () => {
  const token = await generateWebAuthnChallengeToken({
    purpose: 'authentication',
    challenge: 'challenge-value',
    ...identity,
  }, env);
  assert.equal(await verifyAdminToken(token, env), null);
});

test('accepts legacy session tokens without a kind claim', async () => {
  const now = Math.floor(Date.now() / 1000);
  const token = await sign({
    ...identity,
    iat: now,
    exp: now + 60,
  }, env.JWT_SECRET, 'HS256');
  assert.deepEqual(await verifyAdminToken(token, env), identity);
});
