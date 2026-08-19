import crypto from "node:crypto";
import bcrypt from "bcrypt";
import type { PrismaClient } from "../../generated/tenant-client/client";
import { AppError } from "../../common/errors";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "./jwt";

const BCRYPT_ROUNDS = 12;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

async function issueTokenPair(
  tenantPrisma: PrismaClient,
  tenantId: string,
  user: { id: string; email: string; role: string },
): Promise<TokenPair> {
  const accessToken = signAccessToken({ sub: user.id, tenantId, email: user.email, role: user.role });

  const jti = crypto.randomUUID();
  const refreshToken = signRefreshToken({ sub: user.id, jti });
  const decoded = verifyRefreshToken(refreshToken);

  await tenantPrisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(decoded.exp * 1000),
    },
  });

  return { accessToken, refreshToken };
}

export async function login(
  tenantPrisma: PrismaClient,
  tenantId: string,
  email: string,
  password: string,
): Promise<TokenPair & { user: { id: string; name: string; email: string; role: string } }> {
  const user = await tenantPrisma.user.findUnique({ where: { email } });
  if (!user || user.status !== "ACTIVE") {
    throw new AppError(401, "INVALID_CREDENTIALS", "Invalid email or password");
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw new AppError(401, "INVALID_CREDENTIALS", "Invalid email or password");
  }

  await tenantPrisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  const tokens = await issueTokenPair(tenantPrisma, tenantId, user);
  return { ...tokens, user: { id: user.id, name: user.name, email: user.email, role: user.role } };
}

export async function refresh(
  tenantPrisma: PrismaClient,
  tenantId: string,
  refreshToken: string,
): Promise<TokenPair> {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new AppError(401, "INVALID_REFRESH_TOKEN", "Refresh token is invalid or expired");
  }

  const stored = await tenantPrisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(refreshToken) },
  });
  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    throw new AppError(401, "INVALID_REFRESH_TOKEN", "Refresh token is invalid or expired");
  }

  const user = await tenantPrisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || user.status !== "ACTIVE") {
    throw new AppError(401, "INVALID_REFRESH_TOKEN", "Refresh token is invalid or expired");
  }

  await tenantPrisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() },
  });

  return issueTokenPair(tenantPrisma, tenantId, user);
}
