import { sign, verify } from 'hono/jwt';
import { requireJwtSecret } from './jwt.ts';

const WEBAUTHN_CHALLENGE_TTL_SECONDS = 5 * 60;
const MAX_CHALLENGE_LENGTH = 512;
const MAX_USERNAME_LENGTH = 128;

type WebAuthnEnv = { JWT_SECRET?: string };

export type WebAuthnChallengePurpose = 'registration' | 'authentication';

export interface WebAuthnChallengePayload {
  purpose: WebAuthnChallengePurpose;
  challenge: string;
  userId: string;
  username: string;
  sessionVersion: number;
}

export interface WebAuthnConfig {
  rpID: string;
  rpName: string;
  origin: string;
}

export function getWebAuthnConfig(requestUrl: string): WebAuthnConfig {
  const url = new URL(requestUrl);
  const rpID = url.hostname.trim().toLowerCase();
  if (!rpID) throw new Error('WebAuthn hostname is unavailable');
  if (
    url.protocol !== 'https:' &&
    rpID !== 'localhost' &&
    rpID !== '127.0.0.1' &&
    rpID !== '[::1]'
  ) {
    throw new Error('WebAuthn requires HTTPS');
  }
  return { rpID, rpName: 'CF VPS Monitor', origin: url.origin };
}

function isChallengePayload(value: unknown, expectedPurpose: WebAuthnChallengePurpose): value is WebAuthnChallengePayload {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Record<string, unknown>;
  return payload.kind === 'cf-monitor-webauthn' &&
    payload.purpose === expectedPurpose &&
    typeof payload.challenge === 'string' &&
    payload.challenge.length > 0 &&
    payload.challenge.length <= MAX_CHALLENGE_LENGTH &&
    typeof payload.userId === 'string' &&
    payload.userId.length > 0 &&
    typeof payload.username === 'string' &&
    payload.username.length > 0 &&
    payload.username.length <= MAX_USERNAME_LENGTH &&
    typeof payload.sessionVersion === 'number' &&
    Number.isSafeInteger(payload.sessionVersion) &&
    payload.sessionVersion >= 1;
}

export async function generateWebAuthnChallengeToken(
  payload: WebAuthnChallengePayload,
  env: WebAuthnEnv,
  nowMs = Date.now(),
): Promise<string> {
  const now = Math.floor(nowMs / 1000);
  return sign({
    ...payload,
    kind: 'cf-monitor-webauthn',
    jti: crypto.randomUUID(),
    iat: now,
    exp: now + WEBAUTHN_CHALLENGE_TTL_SECONDS,
  }, requireJwtSecret(env), 'HS256');
}

export async function verifyWebAuthnChallengeToken(
  token: string,
  expectedPurpose: WebAuthnChallengePurpose,
  env: WebAuthnEnv,
): Promise<WebAuthnChallengePayload | null> {
  try {
    const payload = await verify(token, requireJwtSecret(env), 'HS256');
    if (!isChallengePayload(payload, expectedPurpose)) return null;
    return {
      purpose: payload.purpose,
      challenge: payload.challenge,
      userId: payload.userId,
      username: payload.username,
      sessionVersion: payload.sessionVersion,
    };
  } catch {
    return null;
  }
}
