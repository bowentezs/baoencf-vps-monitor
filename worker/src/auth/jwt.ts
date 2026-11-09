import { sign, verify } from 'hono/jwt';

const MIN_JWT_SECRET_BYTES = 32;

export class AuthConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthConfigurationError';
  }
}

type JwtEnv = {
  JWT_SECRET?: string;
};

const SESSION_TOKEN_KIND = 'cf-monitor-session';

export type AdminJwtPayload = {
  userId: string;
  username: string;
  sessionVersion: number;
};

export function requireJwtSecret(env: JwtEnv): string {
  const secret = env.JWT_SECRET?.trim() ?? '';
  const secretBytes = new TextEncoder().encode(secret).byteLength;

  if (secretBytes < MIN_JWT_SECRET_BYTES) {
    throw new AuthConfigurationError('JWT_SECRET must be at least 32 bytes');
  }

  return secret;
}

export async function generateToken(
  userId: string,
  username: string,
  sessionVersion: number,
  env: JwtEnv,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    kind: SESSION_TOKEN_KIND,
    userId,
    username,
    sessionVersion,
    iat: now,
    exp: now + 7 * 24 * 60 * 60,
  };

  return sign(payload, requireJwtSecret(env), 'HS256');
}

export async function verifyAdminToken(token: string, env: JwtEnv): Promise<AdminJwtPayload | null> {
  const payload = await verify(token, requireJwtSecret(env), 'HS256');

  // 旧版 session token 没有 kind；其他所有短寿命 token（MFA、WebAuthn challenge）
  // 都带各自的 kind，绝不能当作管理员会话接受。
  if (payload.kind !== undefined && payload.kind !== SESSION_TOKEN_KIND) {
    return null;
  }

  if (
    !payload ||
    typeof payload.userId !== 'string' ||
    typeof payload.username !== 'string' ||
    typeof payload.sessionVersion !== 'number' ||
    !Number.isSafeInteger(payload.sessionVersion) ||
    payload.sessionVersion < 1
  ) {
    return null;
  }

  return {
    userId: payload.userId,
    username: payload.username,
    sessionVersion: payload.sessionVersion,
  };
}
