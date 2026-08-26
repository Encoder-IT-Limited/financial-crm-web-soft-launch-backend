import type { PrismaClient } from "../../generated/tenant-client/client";
import { AppError } from "../../utils/errors";
import {
  createCreditNote,
  getInvoice,
  recordPayment,
} from "../invoicing/invoicing.service";

async function generateRetainerNumber(tenantPrisma: PrismaClient): Promise<string> {
  const count = await tenantPrisma.retainer.count();
  return `RET-${String(count + 1).padStart(6, "0")}`;
}

interface CreateRetainerInput {
  customerId: string;
  contractAmount: number;
  billingPeriod: string;
  billingModel: "ONE_TIME" | "RECURRING";
  currency?: string;
  startDate: Date;
  expiryDate?: Date;
  notes?: string;
  fundingInvoiceId?: string;
}

export async function createRetainer(
  tenantPrisma: PrismaClient,
  tenantId: string,
  input: CreateRetainerInput,
) {
  const customer = await tenantPrisma.customer.findUnique({ where: { id: input.customerId } });
  if (!customer) throw new AppError(404, "CUSTOMER_NOT_FOUND", "Customer not found");

  const retainerNumber = await generateRetainerNumber(tenantPrisma);

  return tenantPrisma.retainer.create({
    data: {
      tenantId,
      customerId: input.customerId,
      retainerNumber,
      contractAmount: input.contractAmount,
      remainingBalance: input.contractAmount,
      billingPeriod: input.billingPeriod,
      billingModel: input.billingModel,
      currency: input.currency ?? "AED",
      status: "ACTIVE",
      startDate: input.startDate,
      expiryDate: input.expiryDate,
      notes: input.notes,
      fundingInvoiceId: input.fundingInvoiceId,
    },
  });
}

export function listRetainers(tenantPrisma: PrismaClient) {
  return tenantPrisma.retainer.findMany({ orderBy: { createdAt: "desc" } });
}

export async function getRetainer(tenantPrisma: PrismaClient, id: string) {
  const retainer = await tenantPrisma.retainer.findUnique({
    where: { id },
    include: { usage: { orderBy: { createdAt: "desc" } } },
  });
  if (!retainer) throw new AppError(404, "RETAINER_NOT_FOUND", "Retainer not found");
  return retainer;
}

interface UpdateRetainerInput {
  billingPeriod?: string;
  billingModel?: "ONE_TIME" | "RECURRING";
  currency?: string;
  startDate?: Date;
  expiryDate?: Date | null;
  notes?: string | null;
  fundingInvoiceId?: string | null;
}

export async function updateRetainer(tenantPrisma: PrismaClient, id: string, input: UpdateRetainerInput) {
  await getRetainer(tenantPrisma, id);
  return tenantPrisma.retainer.update({
    where: { id },
    data: {
      billingPeriod: input.billingPeriod,
      billingModel: input.billingModel,
      currency: input.currency,
      startDate: input.startDate,
      expiryDate: input.expiryDate,
      notes: input.notes,
      fundingInvoiceId: input.fundingInvoiceId,
    },
    include: { usage: { orderBy: { createdAt: "desc" } } },
  });
}

export async function setRetainerStatus(
  tenantPrisma: PrismaClient,
  id: string,
  status: "ACTIVE" | "PAUSED" | "CLOSED",
) {
  const retainer = await getRetainer(tenantPrisma, id);
  if (retainer.status === "CLOSED" && status !== "CLOSED") {
    throw new AppError(409, "RETAINER_CLOSED", "Cannot reopen a closed retainer");
  }
  return tenantPrisma.retainer.update({
    where: { id },
    data: { status },
    include: { usage: { orderBy: { createdAt: "desc" } } },
  });
}

export async function drawRetainer(
  tenantPrisma: PrismaClient,
  tenantId: string,
  id: string,
  input: { invoiceId: string; amount?: number },
  userId: string,
) {
  const retainer = await getRetainer(tenantPrisma, id);
  if (retainer.status !== "ACTIVE") {
    throw new AppError(409, "INVALID_RETAINER_STATE", `Retainer is ${retainer.status}, expected ACTIVE`);
  }
  const remaining = Number(retainer.remainingBalance);
  if (remaining <= 0) {
    throw new AppError(409, "INSUFFICIENT_BALANCE", "Retainer has no remaining balance");
  }

  const invoice = await getInvoice(tenantPrisma, input.invoiceId);
  if (invoice.customerId !== retainer.customerId) {
    throw new AppError(400, "CUSTOMER_MISMATCH", "Invoice customer does not match retainer customer");
  }

  const invoiceBalance = Number(invoice.balanceDue);
  if (invoiceBalance <= 0) {
    throw new AppError(409, "INVOICE_PAID", "Invoice has no balance due");
  }

  const requested = input.amount ?? invoiceBalance;
  const drawAmount = Math.min(requested, invoiceBalance, remaining);
  if (drawAmount <= 0) {
    throw new AppError(400, "INVALID_AMOUNT", "Draw amount must be positive");
  }

  const paymentResult = await recordPayment(
    tenantPrisma,
    tenantId,
    input.invoiceId,
    {
      amount: drawAmount,
      paymentMethod: "OTHER",
      transactionReference: retainer.retainerNumber,
    },
    userId,
  );

  const updated = await tenantPrisma.$transaction(async (tx) => {
    await tx.retainerUsage.create({
      data: {
        retainerId: id,
        date: new Date(),
        amount: drawAmount,
        note: `Draw against invoice ${invoice.invoiceNumber}`,
      },
    });
    return tx.retainer.update({
      where: { id },
      data: { remainingBalance: remaining - drawAmount },
      include: { usage: { orderBy: { createdAt: "desc" } } },
    });
  });

  return { retainer: updated, payment: paymentResult.payment, invoice: paymentResult.invoice };
}

export async function topUpRetainer(
  tenantPrisma: PrismaClient,
  id: string,
  input: { amount: number; note?: string; increaseContractAmount: boolean },
) {
  const retainer = await getRetainer(tenantPrisma, id);
  if (retainer.status === "CLOSED") {
    throw new AppError(409, "RETAINER_CLOSED", "Cannot top up a closed retainer");
  }

  return tenantPrisma.$transaction(async (tx) => {
    await tx.retainerUsage.create({
      data: {
        retainerId: id,
        date: new Date(),
        amount: -input.amount,
        note: input.note ?? "top-up",
      },
    });
    return tx.retainer.update({
      where: { id },
      data: {
        remainingBalance: Number(retainer.remainingBalance) + input.amount,
        ...(input.increaseContractAmount
          ? { contractAmount: Number(retainer.contractAmount) + input.amount }
          : {}),
      },
      include: { usage: { orderBy: { createdAt: "desc" } } },
    });
  });
}

export async function transferRetainer(tenantPrisma: PrismaClient, id: string, toRetainerId: string) {
  if (id === toRetainerId) {
    throw new AppError(400, "INVALID_TRANSFER", "Cannot transfer a retainer to itself");
  }

  const source = await getRetainer(tenantPrisma, id);
  if (source.status === "CLOSED") {
    throw new AppError(409, "RETAINER_CLOSED", "Source retainer is already closed");
  }
  const remaining = Number(source.remainingBalance);
  if (remaining <= 0) {
    throw new AppError(409, "INSUFFICIENT_BALANCE", "Source retainer has no remaining balance");
  }

  const target = await getRetainer(tenantPrisma, toRetainerId);
  if (target.status === "CLOSED") {
    throw new AppError(409, "RETAINER_CLOSED", "Target retainer is closed");
  }
  if (target.customerId !== source.customerId) {
    throw new AppError(400, "CUSTOMER_MISMATCH", "Retainers must belong to the same customer");
  }

  return tenantPrisma.$transaction(async (tx) => {
    await tx.retainerUsage.create({
      data: {
        retainerId: id,
        date: new Date(),
        amount: remaining,
        note: `Transfer to ${target.retainerNumber}`,
      },
    });
    await tx.retainerUsage.create({
      data: {
        retainerId: toRetainerId,
        date: new Date(),
        amount: -remaining,
        note: `Transfer from ${source.retainerNumber}`,
      },
    });

    const closed = await tx.retainer.update({
      where: { id },
      data: {
        remainingBalance: 0,
        status: "CLOSED",
        dispositionReason: "TRANSFER",
        transferredToRetainerId: toRetainerId,
      },
      include: { usage: { orderBy: { createdAt: "desc" } } },
    });

    const updatedTarget = await tx.retainer.update({
      where: { id: toRetainerId },
      data: {
        remainingBalance: Number(target.remainingBalance) + remaining,
        contractAmount: Number(target.contractAmount) + remaining,
      },
      include: { usage: { orderBy: { createdAt: "desc" } } },
    });

    return { source: closed, target: updatedTarget };
  });
}

export async function rollOverRetainer(tenantPrisma: PrismaClient, id: string, expiryDate?: Date) {
  const retainer = await getRetainer(tenantPrisma, id);
  if (retainer.status === "CLOSED") {
    throw new AppError(409, "RETAINER_CLOSED", "Cannot roll over a closed retainer");
  }

  const remaining = Number(retainer.remainingBalance);
  if (remaining <= 0) {
    throw new AppError(409, "INSUFFICIENT_BALANCE", "No remaining balance to roll over");
  }

  let nextExpiry = expiryDate;
  if (!nextExpiry) {
    const base = retainer.expiryDate ?? new Date();
    nextExpiry = new Date(base);
    nextExpiry.setFullYear(nextExpiry.getFullYear() + 1);
  }

  return tenantPrisma.$transaction(async (tx) => {
    const count = await tx.retainer.count();
    const retainerNumber = `RET-${String(count + 1).padStart(6, "0")}`;

    const created = await tx.retainer.create({
      data: {
        tenantId: retainer.tenantId,
        customerId: retainer.customerId,
        retainerNumber,
        contractAmount: remaining,
        remainingBalance: remaining,
        billingPeriod: retainer.billingPeriod,
        billingModel: retainer.billingModel,
        currency: retainer.currency,
        status: "ACTIVE",
        startDate: new Date(),
        expiryDate: nextExpiry,
        notes: retainer.notes,
        fundingInvoiceId: retainer.fundingInvoiceId,
        rolledOverFromRetainerId: retainer.id,
      },
      include: { usage: true },
    });

    await tx.retainerUsage.create({
      data: {
        retainerId: id,
        date: new Date(),
        amount: remaining,
        note: `Rolled over to ${created.retainerNumber}`,
      },
    });

    const closed = await tx.retainer.update({
      where: { id },
      data: {
        remainingBalance: 0,
        status: "CLOSED",
        dispositionReason: "ROLL_OVER",
        rolledOverToRetainerId: created.id,
      },
      include: { usage: { orderBy: { createdAt: "desc" } } },
    });

    return { source: closed, retainer: created };
  });
}

export async function forfeitRetainer(tenantPrisma: PrismaClient, id: string) {
  const retainer = await getRetainer(tenantPrisma, id);
  if (retainer.status === "CLOSED") {
    throw new AppError(409, "RETAINER_CLOSED", "Retainer is already closed");
  }

  return tenantPrisma.$transaction(async (tx) => {
    const remaining = Number(retainer.remainingBalance);
    if (remaining > 0) {
      await tx.retainerUsage.create({
        data: {
          retainerId: id,
          date: new Date(),
          amount: remaining,
          note: "Forfeit",
        },
      });
    }
    return tx.retainer.update({
      where: { id },
      data: {
        remainingBalance: 0,
        status: "CLOSED",
        dispositionReason: "FORFEIT",
      },
      include: { usage: { orderBy: { createdAt: "desc" } } },
    });
  });
}

/** Exported for tests — reject over-balance refunds instead of silently capping. */
export function resolveRefundAmount(remaining: number, requested?: number): number {
  if (remaining <= 0) {
    throw new AppError(409, "INSUFFICIENT_BALANCE", "Retainer has no remaining balance to refund");
  }
  if (requested != null && requested > remaining + 1e-9) {
    throw new AppError(
      400,
      "REFUND_EXCEEDS_BALANCE",
      `Requested refund (${requested}) exceeds remaining balance (${remaining})`,
    );
  }
  return requested ?? remaining;
}

export async function refundRetainer(
  tenantPrisma: PrismaClient,
  tenantId: string,
  id: string,
  reason: string,
  userId: string,
  requestedAmount?: number,
) {
  const retainer = await getRetainer(tenantPrisma, id);
  if (retainer.status === "CLOSED") {
    throw new AppError(409, "RETAINER_CLOSED", "Retainer is already closed");
  }

  const remaining = Number(retainer.remainingBalance);
  const refundAmount = resolveRefundAmount(remaining, requestedAmount);

  const creditNote = await createCreditNote(
    tenantPrisma,
    tenantId,
    {
      customerId: retainer.customerId,
      // Standalone CN so convert-to-invoice pattern works; funding invoice
      // referenced in the reason text (plan Key Decision #6).
      amount: refundAmount,
      reason: `Retainer refund ${retainer.retainerNumber}: ${reason}${
        retainer.fundingInvoiceId ? ` (funding invoice ${retainer.fundingInvoiceId})` : ""
      }`,
      currency: retainer.currency,
      linkedReturn: false,
      refundAmount,
    },
    userId,
  );

  const nextBalance = remaining - refundAmount;
  const updated = await tenantPrisma.$transaction(async (tx) => {
    await tx.retainerUsage.create({
      data: {
        retainerId: id,
        date: new Date(),
        amount: refundAmount,
        note: `Refund: ${reason}`,
      },
    });
    return tx.retainer.update({
      where: { id },
      data: {
        remainingBalance: nextBalance,
        status: nextBalance <= 1e-9 ? "CLOSED" : retainer.status,
        dispositionReason: nextBalance <= 1e-9 ? "REFUND" : retainer.dispositionReason,
        refundAdjustmentId: creditNote.id,
      },
      include: { usage: { orderBy: { createdAt: "desc" } } },
    });
  });

  return { retainer: updated, creditNote };
}
