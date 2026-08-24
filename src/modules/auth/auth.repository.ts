import type { PrismaClient } from "../../generated/tenant-client/client";

export function findUserByEmail(db: PrismaClient, email: string) {
  return db.user.findUnique({ where: { email } });
}

export function findUserById(db: PrismaClient, id: string) {
  return db.user.findUnique({ where: { id } });
}

export function touchLastLogin(db: PrismaClient, userId: string) {
  return db.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
}

export function createRefreshToken(
  db: PrismaClient,
  data: { userId: string; tokenHash: string; expiresAt: Date },
) {
  return db.refreshToken.create({ data });
}

export function findRefreshTokenByHash(db: PrismaClient, tokenHash: string) {
  return db.refreshToken.findUnique({ where: { tokenHash } });
}

export function revokeRefreshToken(db: PrismaClient, id: string) {
  return db.refreshToken.update({ where: { id }, data: { revokedAt: new Date() } });
}
