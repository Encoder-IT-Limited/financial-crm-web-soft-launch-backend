import crypto from "node:crypto";
import bcrypt from "bcrypt";
import { publicPrisma } from "../../db/publicPrisma";
import { AppError } from "../../utils/errors";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../../utils/jwt";
import { hashToken } from "./auth.service";

export async function platformLogin(email: string, password: string) {
  const user = await publicPrisma.platformUser.findUnique({ where: { email } });
  if (!user || user.status !== "ACTIVE") return null;

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return null;

  await publicPrisma.platformUser.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  return issuePlatformTokens(user);
}

export async function platformRotateRefresh(refreshToken: string) {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new AppError(401, "INVALID_REFRESH_TOKEN", "Refresh token is invalid or expired");
  }
  if (payload.realm !== "admin") {
    throw new AppError(401, "INVALID_REFRESH_TOKEN", "Refresh token is invalid or expired");
  }

  const stored = await publicPrisma.platformRefreshToken.findUnique({
    where: { tokenHash: hashToken(refreshToken) },
  });
  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    throw new AppError(401, "INVALID_REFRESH_TOKEN", "Refresh token is invalid or expired");
  }

  const user = await publicPrisma.platformUser.findUnique({ where: { id: payload.sub } });
  if (!user || user.status !== "ACTIVE") {
    throw new AppError(401, "INVALID_REFRESH_TOKEN", "Refresh token is invalid or expired");
  }

  await publicPrisma.platformRefreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
  return issuePlatformTokens(user);
}

async function issuePlatformTokens(user: { id: string; email: string; name: string }) {
  const accessToken = signAccessToken({
    sub: user.id,
    email: user.email,
    role: "SUPER_ADMIN",
    realm: "admin",
    name: user.name,
  });
  const refreshToken = signRefreshToken({ sub: user.id, jti: crypto.randomUUID(), realm: "admin" });
  const decoded = verifyRefreshToken(refreshToken);
  await publicPrisma.platformRefreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(decoded.exp * 1000),
    },
  });
  return {
    accessToken,
    refreshToken,
    user: { id: user.id, name: user.name, email: user.email, role: "SUPER_ADMIN" as const },
  };
}
