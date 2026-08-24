import { publicPrisma } from "../../db/publicPrisma";
import { AppError } from "../../utils/errors";
import { writeAudit } from "../audit/audit.service";
import type { RequestUser } from "../../types/express";

export function toPaymentDto(row: {
  id: string;
  tenantId: string;
  reference: string;
  planName: string;
  type: string;
  amount: unknown;
  method: string;
  status: string;
  paidAt: Date;
  tenant?: { name: string };
}) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    tenantName: row.tenant?.name ?? "",
    reference: row.reference,
    planName: row.planName,
    type: row.type,
    amount: Number(row.amount),
    method: row.method,
    status: row.status,
    date: row.paidAt.toISOString(),
  };
}

export function listPayments() {
  return publicPrisma.platformPayment.findMany({
    include: { tenant: { select: { name: true } } },
    orderBy: { paidAt: "desc" },
    take: 200,
  });
}

export async function updatePaymentStatus(id: string, status: string, actor?: RequestUser) {
  const payment = await publicPrisma.platformPayment.findUnique({
    where: { id },
    include: { tenant: { select: { name: true } } },
  });
  if (!payment) throw new AppError(404, "PAYMENT_NOT_FOUND", "Payment not found");
  const updated = await publicPrisma.platformPayment.update({
    where: { id },
    data: { status },
    include: { tenant: { select: { name: true } } },
  });
  await writeAudit({
    actor,
    tenantId: payment.tenantId,
    tenantName: payment.tenant.name,
    module: "Payments",
    entity: "Payment",
    entityLabel: payment.reference,
    action: "update",
    oldValues: { status: payment.status },
    newValues: { status },
  });
  return updated;
}
