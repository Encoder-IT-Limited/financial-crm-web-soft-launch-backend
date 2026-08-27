import crypto from "node:crypto";
import bcrypt from "bcrypt";
import type { PrismaClient } from "../../generated/tenant-client/client";
import { publicPrisma } from "../../db/publicPrisma";
import { AppError } from "../../utils/errors";
import { hashPassword } from "./auth.service";

const OTP_TTL_MS = 15 * 60 * 1000;

function generateOtp() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

export async function requestPasswordReset(email: string) {
  const normalized = email.trim().toLowerCase();
  const otp = generateOtp();
  const otpHash = await bcrypt.hash(otp, 10);
  await publicPrisma.passwordResetToken.create({
    data: {
      email: normalized,
      otpHash,
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    },
  });
  const payload: { accepted: true; otp?: string } = { accepted: true };
  if (process.env.NODE_ENV !== "production") payload.otp = otp;
  return payload;
}

async function findValidToken(email: string, otp: string) {
  const normalized = email.trim().toLowerCase();
  const tokens = await publicPrisma.passwordResetToken.findMany({
    where: { email: normalized, usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  for (const token of tokens) {
    if (await bcrypt.compare(otp, token.otpHash)) return token;
  }
  return null;
}

export async function verifyPasswordOtp(email: string, otp: string) {
  const token = await findValidToken(email, otp);
  if (!token) throw new AppError(400, "INVALID_OTP", "Invalid or expired verification code");
  return { verified: true };
}

export async function resetPassword(
  email: string,
  otp: string,
  password: string,
  tenantPrisma?: PrismaClient,
) {
  const token = await findValidToken(email, otp);
  if (!token) throw new AppError(400, "INVALID_OTP", "Invalid or expired verification code");

  const normalized = email.trim().toLowerCase();
  const passwordHash = await hashPassword(password);
  const platformUser = await publicPrisma.platformUser.findFirst({
    where: { email: { equals: normalized, mode: "insensitive" } },
  });
  if (platformUser) {
    await publicPrisma.platformUser.update({ where: { id: platformUser.id }, data: { passwordHash } });
  } else if (tenantPrisma) {
    const tenantUser = await tenantPrisma.user.findFirst({
      where: { email: { equals: normalized, mode: "insensitive" } },
    });
    if (!tenantUser) throw new AppError(404, "USER_NOT_FOUND", "No account found for this email");
    await tenantPrisma.user.update({ where: { id: tenantUser.id }, data: { passwordHash } });
  } else {
    throw new AppError(404, "USER_NOT_FOUND", "No account found for this email");
  }

  await publicPrisma.passwordResetToken.update({
    where: { id: token.id },
    data: { usedAt: new Date() },
  });
  return { reset: true };
}
