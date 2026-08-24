import jwt from "jsonwebtoken";
import { env } from "../config/env";

export interface AccessTokenClaims {
  sub: string;
  email: string;
  role: string;
  realm: "admin" | "tenant";
  tenantId?: string;
  name?: string;
}

export function signAccessToken(claims: AccessTokenClaims): string {
  return jwt.sign(claims, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });
}

export function verifyAccessToken(token: string): AccessTokenClaims {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenClaims;
}

export interface RefreshTokenClaims {
  sub: string;
  jti: string;
  realm: "admin" | "tenant";
}

export type VerifiedRefreshToken = RefreshTokenClaims & { exp: number; iat: number };

export function signRefreshToken(claims: RefreshTokenClaims): string {
  return jwt.sign(claims, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });
}

export function verifyRefreshToken(token: string): VerifiedRefreshToken {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as VerifiedRefreshToken;
}
