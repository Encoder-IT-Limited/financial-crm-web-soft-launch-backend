import type { InvoiceStatus, Prisma } from "../../generated/tenant-client/client";

export type InvoiceListFilters = {
  search?: string;
  status?: string;
  customerId?: string;
  matchingCustomerIds?: string[];
  overdue?: boolean;
  now?: Date;
};

const STORED_STATUS: Record<string, InvoiceStatus> = {
  draft: "DRAFT",
  DRAFT: "DRAFT",
  sent: "SENT",
  SENT: "SENT",
  "partially-paid": "PARTIALLY_PAID",
  PARTIALLY_PAID: "PARTIALLY_PAID",
  paid: "PAID",
  PAID: "PAID",
  cancelled: "CANCELLED",
  CANCELLED: "CANCELLED",
};

function startOfDay(now: Date): Date {
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  return day;
}

/** SENT/PARTIALLY_PAID past the due date with a remaining balance — same as the UI display status. */
export function overdueWhere(now = new Date()): Prisma.InvoiceWhereInput {
  return {
    status: { in: ["SENT", "PARTIALLY_PAID"] },
    dueDate: { lt: startOfDay(now) },
    balanceDue: { gt: 0 },
  };
}

/** Stored SENT/PARTIALLY_PAID that the UI still shows as that status (not overdue). */
export function notOverdueForStatus(
  status: "SENT" | "PARTIALLY_PAID",
  now = new Date(),
): Prisma.InvoiceWhereInput {
  const start = startOfDay(now);
  return {
    status,
    OR: [{ dueDate: { gte: start } }, { balanceDue: { lte: 0 } }],
  };
}

export function invoiceListWhere(query: InvoiceListFilters = {}): Prisma.InvoiceWhereInput {
  const now = query.now ?? new Date();
  const parts: Prisma.InvoiceWhereInput[] = [];

  if (query.customerId) {
    parts.push({ customerId: query.customerId });
  }

  const search = query.search?.trim();
  if (search) {
    const or: Prisma.InvoiceWhereInput[] = [{ invoiceNumber: { contains: search, mode: "insensitive" } }];
    if (query.matchingCustomerIds && query.matchingCustomerIds.length > 0) {
      or.push({ customerId: { in: query.matchingCustomerIds } });
    }
    parts.push({ OR: or });
  }

  const rawStatus = query.status?.trim();
  if (rawStatus) {
    const normalized = rawStatus.toLowerCase();
    if (normalized === "overdue") {
      parts.push(overdueWhere(now));
    } else if (normalized === "sent" || rawStatus === "SENT") {
      parts.push(notOverdueForStatus("SENT", now));
    } else if (normalized === "partially-paid" || rawStatus === "PARTIALLY_PAID") {
      parts.push(notOverdueForStatus("PARTIALLY_PAID", now));
    } else {
      const stored = STORED_STATUS[rawStatus] ?? STORED_STATUS[normalized];
      if (stored) parts.push({ status: stored });
    }
  }

  if (query.overdue === true) {
    parts.push(overdueWhere(now));
  } else if (query.overdue === false) {
    parts.push({ NOT: overdueWhere(now) });
  }

  if (parts.length === 0) return {};
  if (parts.length === 1) return parts[0]!;
  return { AND: parts };
}
