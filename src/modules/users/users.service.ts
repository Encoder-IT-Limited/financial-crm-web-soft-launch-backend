import crypto from "node:crypto";
import type { PrismaClient as TenantPrisma } from "../../generated/tenant-client/client";
import type { UserStatus } from "../../generated/tenant-client/client";
import { publicPrisma } from "../../db/publicPrisma";
import { getTenantPrismaClient } from "../../db/tenantClientCache";
import { hashPassword, hashToken } from "../auth/auth.service";
import { AppError } from "../../utils/errors";
import { env } from "../../config/env";
import { mailer } from "../../utils/mailer";
import { getSettings } from "../settings/settings.service";
import { occupiesSeat, usedSeats } from "../../utils/seats";
import { isPagedQuery, parsePageQuery, pageMeta, type PageQuery } from "../../utils/pagination";
import type { InviteCreatedDto, InvitePreviewDto, SeatUsageDto, TenantUserDto } from "./users.dto";
import { findAssignableRole } from "./roles.service";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  lastLoginAt: Date | null;
  createdAt: Date;
};

function toUserDto(row: UserRow, inviteId: string | null = null): TenantUserDto {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    status: row.status as TenantUserDto["status"],
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    inviteId,
  };
}

async function pendingInvitesByUserId(tenantId: string) {
  const rows = await publicPrisma.userInvite.findMany({
    where: { tenantId, acceptedAt: null },
    select: { id: true, userId: true },
  });
  return new Map(rows.map((r) => [r.userId, r.id]));
}

type SeatUser = { status: string; assignedRole: { countsTowardSeats: boolean } | null };

function seatFlags(users: SeatUser[]) {
  return users.map((u) => ({
    status: u.status,
    countsTowardSeats: u.assignedRole?.countsTowardSeats ?? false,
  }));
}

async function seatUsageFor(tenantId: string, schemaName: string, extraSeats: number): Promise<SeatUsageDto> {
  const tenantPrisma = getTenantPrismaClient(schemaName);
  const users = await tenantPrisma.user.findMany({
    select: { status: true, assignedRole: { select: { countsTowardSeats: true } } },
  });
  const subscription = await publicPrisma.subscription.findFirst({
    where: { tenantId },
    include: { plan: true },
    orderBy: { startDate: "desc" },
  });
  const settings = await getSettings();
  const total = (subscription?.plan.baseSeats ?? 0) + extraSeats;
  return {
    used: usedSeats(seatFlags(users)),
    total,
    message: settings.seatLimitMessage,
  };
}

async function assertSeatAvailable(
  tenantId: string,
  schemaName: string,
  extraSeats: number,
  nextCountsTowardSeats: boolean,
  releasing?: { status: string; countsTowardSeats: boolean },
) {
  if (!nextCountsTowardSeats) return;
  const usage = await seatUsageFor(tenantId, schemaName, extraSeats);
  const releasingSeat = releasing && occupiesSeat(releasing.status) && releasing.countsTowardSeats ? 1 : 0;
  if (usage.used - releasingSeat + 1 > usage.total) {
    throw new AppError(409, "SEAT_LIMIT_REACHED", usage.message);
  }
}

function issueInviteToken() {
  const token = crypto.randomBytes(32).toString("hex");
  return { token, tokenHash: hashToken(token) };
}

function acceptUrl(token: string) {
  return `${env.APP_URL.replace(/\/$/, "")}/invite/accept?token=${encodeURIComponent(token)}`;
}

async function sendInviteMail(to: string, tenantName: string, token: string) {
  const url = acceptUrl(token);
  const result = await mailer.sendInvite({ to, tenantName, acceptUrl: url });
  return { sent: result.sent, acceptUrl: url };
}

async function extraSeatsFor(tenantId: string) {
  const tenant = await publicPrisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new AppError(404, "TENANT_NOT_FOUND", "Tenant not found");
  return { extraSeats: tenant.extraSeats, schemaName: tenant.schemaName, name: tenant.name };
}

export async function getSeats(tenantId: string, schemaName: string) {
  const { extraSeats } = await extraSeatsFor(tenantId);
  return seatUsageFor(tenantId, schemaName, extraSeats);
}

export async function listUsers(
  tenantPrisma: TenantPrisma,
  tenantId: string,
  query: PageQuery & { search?: string; status?: UserStatus },
) {
  const where = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: "insensitive" as const } },
            { email: { contains: query.search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const invites = await pendingInvitesByUserId(tenantId);
  const paginate = isPagedQuery(query);

  if (!paginate) {
    const rows = await tenantPrisma.user.findMany({ where, orderBy: { createdAt: "asc" } });
    const items = rows.map((row) => toUserDto(row, invites.get(row.id) ?? null));
    return { items, meta: pageMeta(items.length, 1, items.length || 1) };
  }

  const { page, pageSize, skip } = parsePageQuery(query);
  const [rows, total] = await Promise.all([
    tenantPrisma.user.findMany({ where, orderBy: { createdAt: "asc" }, skip, take: pageSize }),
    tenantPrisma.user.count({ where }),
  ]);
  return {
    items: rows.map((row) => toUserDto(row, invites.get(row.id) ?? null)),
    meta: pageMeta(total, page, pageSize),
  };
}

export async function createInvite(input: {
  tenantId: string;
  schemaName: string;
  tenantName: string;
  actorId: string;
  name: string;
  email: string;
  role: string;
}): Promise<InviteCreatedDto> {
  const email = input.email.trim().toLowerCase();
  const tenantPrisma = getTenantPrismaClient(input.schemaName);
  const { extraSeats } = await extraSeatsFor(input.tenantId);
  const role = await findAssignableRole(tenantPrisma, input.tenantId, input.role);

  const existing = await tenantPrisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
  });
  if (existing) {
    throw new AppError(409, "USER_EXISTS", "A user with that email already exists");
  }

  await assertSeatAvailable(input.tenantId, input.schemaName, extraSeats, role.countsTowardSeats);

  const placeholderHash = await hashPassword(crypto.randomBytes(32).toString("hex"));
  const user = await tenantPrisma.user.create({
    data: {
      tenantId: input.tenantId,
      name: input.name.trim(),
      email,
      passwordHash: placeholderHash,
      role: role.key,
      roleId: role.id,
      status: "INVITED",
    },
  });

  const { token, tokenHash } = issueInviteToken();
  const invite = await publicPrisma.userInvite.create({
    data: {
      tenantId: input.tenantId,
      userId: user.id,
      email,
      name: user.name,
      role: role.key,
      tokenHash,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      invitedBy: input.actorId,
    },
  });

  const mail = await sendInviteMail(email, input.tenantName, token);
  const dto: InviteCreatedDto = { ...toUserDto(user, invite.id) };
  if (!mail.sent) {
    dto.acceptToken = token;
    dto.acceptUrl = mail.acceptUrl;
  }
  return dto;
}

export async function resendInvite(input: {
  tenantId: string;
  tenantName: string;
  inviteId: string;
}): Promise<InviteCreatedDto> {
  const invite = await publicPrisma.userInvite.findFirst({
    where: { id: input.inviteId, tenantId: input.tenantId, acceptedAt: null },
  });
  if (!invite) throw new AppError(404, "INVITE_NOT_FOUND", "Invite not found");

  const tenant = await publicPrisma.tenant.findUnique({ where: { id: input.tenantId } });
  if (!tenant) throw new AppError(404, "TENANT_NOT_FOUND", "Tenant not found");
  const tenantPrisma = getTenantPrismaClient(tenant.schemaName);
  const user = await tenantPrisma.user.findUnique({ where: { id: invite.userId } });
  if (!user || user.status !== "INVITED") {
    throw new AppError(404, "INVITE_NOT_FOUND", "Invite not found");
  }

  const { token, tokenHash } = issueInviteToken();
  await publicPrisma.userInvite.update({
    where: { id: invite.id },
    data: { tokenHash, expiresAt: new Date(Date.now() + INVITE_TTL_MS) },
  });

  const mail = await sendInviteMail(invite.email, input.tenantName, token);
  const dto: InviteCreatedDto = { ...toUserDto(user, invite.id) };
  if (!mail.sent) {
    dto.acceptToken = token;
    dto.acceptUrl = mail.acceptUrl;
  }
  return dto;
}

export async function cancelInvite(input: { tenantId: string; schemaName: string; inviteId: string }) {
  const invite = await publicPrisma.userInvite.findFirst({
    where: { id: input.inviteId, tenantId: input.tenantId, acceptedAt: null },
  });
  if (!invite) throw new AppError(404, "INVITE_NOT_FOUND", "Invite not found");

  const tenantPrisma = getTenantPrismaClient(input.schemaName);
  const user = await tenantPrisma.user.findUnique({ where: { id: invite.userId } });
  if (user && user.status === "INVITED") {
    await tenantPrisma.refreshToken.deleteMany({ where: { userId: user.id } });
    await tenantPrisma.user.delete({ where: { id: user.id } });
  }
  await publicPrisma.userInvite.delete({ where: { id: invite.id } });
  return { cancelled: true };
}

export async function updateUser(input: {
  tenantId: string;
  schemaName: string;
  actorId: string;
  userId: string;
  name?: string;
  role?: string;
  status?: "ACTIVE" | "DISABLED";
}): Promise<TenantUserDto> {
  const { extraSeats } = await extraSeatsFor(input.tenantId);
  const tenantPrisma = getTenantPrismaClient(input.schemaName);
  const user = await tenantPrisma.user.findUnique({
    where: { id: input.userId },
    include: { assignedRole: true },
  });
  if (!user) throw new AppError(404, "USER_NOT_FOUND", "User not found");

  if (user.status === "INVITED" && input.status) {
    throw new AppError(400, "INVITE_PENDING", "Cancel the invite instead of changing status");
  }

  if (user.role === "OWNER") {
    if (input.role || input.status === "DISABLED") {
      throw new AppError(400, "LAST_OWNER", "The owner role cannot be changed or disabled");
    }
  }

  if (user.id === input.actorId && (input.role !== undefined || input.status !== undefined)) {
    throw new AppError(400, "CANNOT_MODIFY_SELF", "You cannot change your own role or status");
  }

  const nextRole = input.role
    ? await findAssignableRole(tenantPrisma, input.tenantId, input.role)
    : user.assignedRole;
  const nextStatus = input.status ?? user.status;
  const currentCounts = user.assignedRole.countsTowardSeats;
  const gainingSeat =
    nextRole.countsTowardSeats && occupiesSeat(nextStatus) && !(currentCounts && occupiesSeat(user.status));

  if (gainingSeat) {
    await assertSeatAvailable(input.tenantId, input.schemaName, extraSeats, nextRole.countsTowardSeats, {
      status: user.status,
      countsTowardSeats: currentCounts,
    });
  }

  const updated = await tenantPrisma.user.update({
    where: { id: user.id },
    data: {
      ...(input.name ? { name: input.name } : {}),
      ...(input.role
        ? {
            role: nextRole.key,
            roleId: nextRole.id,
          }
        : {}),
      ...(input.status ? { status: input.status } : {}),
    },
  });

  const invites = await pendingInvitesByUserId(input.tenantId);
  return toUserDto(updated, invites.get(updated.id) ?? null);
}

export async function previewInvite(token: string): Promise<InvitePreviewDto> {
  const invite = await findValidInvite(token);
  const tenant = await publicPrisma.tenant.findUnique({ where: { id: invite.tenantId } });
  if (!tenant) throw new AppError(404, "INVITE_NOT_FOUND", "Invite is invalid or expired");
  return {
    email: invite.email,
    name: invite.name,
    role: invite.role,
    tenantName: tenant.name,
  };
}

export async function acceptInvite(token: string, password: string) {
  const invite = await findValidInvite(token);
  const tenant = await publicPrisma.tenant.findUnique({ where: { id: invite.tenantId } });
  if (!tenant) throw new AppError(404, "INVITE_NOT_FOUND", "Invite is invalid or expired");

  const tenantPrisma = getTenantPrismaClient(tenant.schemaName);
  const user = await tenantPrisma.user.findUnique({ where: { id: invite.userId } });
  if (!user || user.status !== "INVITED") {
    throw new AppError(400, "INVITE_NOT_FOUND", "Invite is invalid or expired");
  }

  const passwordHash = await hashPassword(password);
  await tenantPrisma.user.update({
    where: { id: user.id },
    data: { passwordHash, status: "ACTIVE" },
  });
  await publicPrisma.userInvite.update({
    where: { id: invite.id },
    data: { acceptedAt: new Date() },
  });

  return { tenant, email: user.email, password };
}

async function findValidInvite(token: string) {
  const invite = await publicPrisma.userInvite.findUnique({
    where: { tokenHash: hashToken(token) },
  });
  if (!invite || invite.acceptedAt || invite.expiresAt <= new Date()) {
    throw new AppError(400, "INVITE_NOT_FOUND", "Invite is invalid or expired");
  }
  return invite;
}
