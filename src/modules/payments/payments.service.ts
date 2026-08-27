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

export async function getPayment(id: string) {
  const payment = await publicPrisma.platformPayment.findUnique({
    where: { id },
    include: { tenant: { select: { name: true } } },
  });
  if (!payment) throw new AppError(404, "PAYMENT_NOT_FOUND", "Payment not found");
  return payment;
}

export function paymentInvoiceHtml(dto: ReturnType<typeof toPaymentDto>) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Invoice ${dto.reference}</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, sans-serif; padding: 40px; color: #111; }
    h1 { font-size: 20px; margin: 0 0 8px; }
    .muted { color: #666; font-size: 13px; }
    table { width: 100%; border-collapse: collapse; margin-top: 24px; }
    th, td { text-align: left; padding: 8px 0; border-bottom: 1px solid #eee; }
    .total { font-weight: 700; font-size: 18px; }
  </style>
</head>
<body>
  <h1>Payment receipt</h1>
  <p class="muted">${dto.reference} · ${new Date(dto.date).toLocaleString()}</p>
  <table>
    <tr><th>Tenant</th><td>${dto.tenantName}</td></tr>
    <tr><th>Plan</th><td>${dto.planName}</td></tr>
    <tr><th>Type</th><td>${dto.type}</td></tr>
    <tr><th>Method</th><td>${dto.method}</td></tr>
    <tr><th>Status</th><td>${dto.status}</td></tr>
    <tr><th>Amount</th><td class="total">${Number(dto.amount).toFixed(2)}</td></tr>
  </table>
</body>
</html>`;
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
