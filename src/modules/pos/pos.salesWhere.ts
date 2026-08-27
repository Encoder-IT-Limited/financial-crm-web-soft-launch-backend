import type { Prisma } from "../../generated/tenant-client/client";

export type SaleListFilters = {
  posSessionId?: string;
  terminalId?: string;
  customerId?: string;
  startDate?: Date;
  endDate?: string | Date;
  search?: string;
  matchingSessionIds?: string[];
};

export function saleListWhere(query: SaleListFilters = {}): Prisma.SaleWhereInput {
  const parts: Prisma.SaleWhereInput[] = [];
  if (query.posSessionId) parts.push({ posSessionId: query.posSessionId });
  if (query.matchingSessionIds) parts.push({ posSessionId: { in: query.matchingSessionIds } });
  if (query.customerId) parts.push({ customerId: query.customerId });
  const search = query.search?.trim();
  if (search) parts.push({ transactionNumber: { contains: search, mode: "insensitive" } });

  const from = query.startDate ? new Date(query.startDate) : undefined;
  const to = query.endDate ? new Date(query.endDate) : undefined;
  if (from && !Number.isNaN(from.getTime()) && to && !Number.isNaN(to.getTime())) {
    parts.push({ transactionDate: { gte: from, lte: to } });
  } else if (from && !Number.isNaN(from.getTime())) {
    parts.push({ transactionDate: { gte: from } });
  } else if (to && !Number.isNaN(to.getTime())) {
    parts.push({ transactionDate: { lte: to } });
  }

  if (parts.length === 0) return {};
  if (parts.length === 1) return parts[0]!;
  return { AND: parts };
}

export type SessionListFilters = {
  status?: "OPEN" | "CLOSED";
  terminalId?: string;
  startDate?: Date;
  endDate?: Date;
};

export function sessionListWhere(query: SessionListFilters = {}): Prisma.PosSessionWhereInput {
  const parts: Prisma.PosSessionWhereInput[] = [];
  if (query.status) parts.push({ status: query.status });
  if (query.terminalId) parts.push({ terminalId: query.terminalId });
  const from = query.startDate ? new Date(query.startDate) : undefined;
  const to = query.endDate ? new Date(query.endDate) : undefined;
  if (from && !Number.isNaN(from.getTime()) && to && !Number.isNaN(to.getTime())) {
    parts.push({ openedAt: { gte: from, lte: to } });
  } else if (from && !Number.isNaN(from.getTime())) {
    parts.push({ openedAt: { gte: from } });
  } else if (to && !Number.isNaN(to.getTime())) {
    parts.push({ openedAt: { lte: to } });
  }
  if (parts.length === 0) return {};
  if (parts.length === 1) return parts[0]!;
  return { AND: parts };
}
