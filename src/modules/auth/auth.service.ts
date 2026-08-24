import crypto from "node:crypto";
import bcrypt from "bcrypt";
import type { PrismaClient } from "../../generated/tenant-client/client";
import { AppError } from "../../utils/errors";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../../utils/jwt";
import type { LoginResponseDto, TokenPairDto } from "./auth.dto";
import * as authRepository from "./auth.repository";

const BCRYPT_ROUNDS = 12;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function issueTokenPair(
  tenantPrisma: PrismaClient,
  tenantId: string,
  user: { id: string; email: string; role: string; name?: string },
): Promise<TokenPairDto> {
  const accessToken = signAccessToken({
    sub: user.id,
    tenantId,
    email: user.email,
    role: user.role,
    realm: "tenant",
    name: user.name,
  });

  const refreshToken = signRefreshToken({ sub: user.id, jti: crypto.randomUUID(), realm: "tenant" });
  const decoded = verifyRefreshToken(refreshToken);

  await authRepository.createRefreshToken(tenantPrisma, {
    userId: user.id,
    tokenHash: hashToken(refreshToken),
    expiresAt: new Date(decoded.exp * 1000),
  });

  return { accessToken, refreshToken };
}

export async function login(
  tenantPrisma: PrismaClient,
  tenantId: string,
  email: string,
  password: string,
): Promise<LoginResponseDto> {
  const user = await authRepository.findUserByEmail(tenantPrisma, email);
  if (!user || user.status !== "ACTIVE") {
    throw new AppError(401, "INVALID_CREDENTIALS", "Invalid email or password");
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw new AppError(401, "INVALID_CREDENTIALS", "Invalid email or password");
  }

  await authRepository.touchLastLogin(tenantPrisma, user.id);
  const tokens = await issueTokenPair(tenantPrisma, tenantId, user);
  return { ...tokens, user: { id: user.id, name: user.name, email: user.email, role: user.role } };
}

export async function refresh(
  tenantPrisma: PrismaClient,
  tenantId: string,
  refreshToken: string,
): Promise<TokenPairDto> {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new AppError(401, "INVALID_REFRESH_TOKEN", "Refresh token is invalid or expired");
  }

  const stored = await authRepository.findRefreshTokenByHash(tenantPrisma, hashToken(refreshToken));
  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    throw new AppError(401, "INVALID_REFRESH_TOKEN", "Refresh token is invalid or expired");
  }

  const user = await authRepository.findUserById(tenantPrisma, payload.sub);
  if (!user || user.status !== "ACTIVE") {
    throw new AppError(401, "INVALID_REFRESH_TOKEN", "Refresh token is invalid or expired");
  }

  await authRepository.revokeRefreshToken(tenantPrisma, stored.id);
  return issueTokenPair(tenantPrisma, tenantId, user);
}
