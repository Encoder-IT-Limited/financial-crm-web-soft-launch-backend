import jwt from "jsonwebtoken";
import { env } from "../../config/env";

export interface AccessTokenClaims {
  sub: string;
  tenantId: string;
  email: string;
  role: string;
}

export function signAccessToken(claims: AccessTokenClaims): string {
  return jwt.sign(claims, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });
}

export function verifyAccessToken(token: string): AccessTokenClaims {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenClaims;
}

// Claims we choose when signing. jwt.sign injects `exp`/`iat` itself from the
// `expiresIn` option — including `exp` here would conflict with that option.
export interface RefreshTokenClaims {
  sub: string;
  jti: string;
}

// What comes back out of jwt.verify: our claims plus the standard registered
// claims jsonwebtoken always adds for a token signed with `expiresIn`.
export type VerifiedRefreshToken = RefreshTokenClaims & { exp: number; iat: number };

export function signRefreshToken(claims: RefreshTokenClaims): string {
  return jwt.sign(claims, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });
}

export function verifyRefreshToken(token: string): VerifiedRefreshToken {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as VerifiedRefreshToken;
}
