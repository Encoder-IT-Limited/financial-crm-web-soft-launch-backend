import type { PrismaClient, Invoice } from "../../generated/tenant-client/client";
import { AppError } from "../../utils/errors";
import { emitAccountingEvent } from "../accounting/accounting.service";
import { receiveStockCore, issueStockCore } from "../inventory/inventory.service";
import { computeInvoiceTotals, isOverdue, lineTotal } from "./invoicing.totals";

export { isOverdue, computeInvoiceTotals };

export function toInvoiceResponse(invoice: Invoice, rootDomain: string) {
  return {
    ...invoice,
    overdue: isOverdue(invoice),
    // Default QR/payment-link target per docs/requirements-qa.md — no real
    // payment gateway wired up yet, so this points at a page that doesn't
    // exist. Needs a provider decision before it's a real payment flow.
    paymentLink: `https://${rootDomain}/pay/${invoice.id}`,
  };
}

async function generateInvoiceNumber(tenantPrisma: PrismaClient): Promise<string> {
  // Simple v1 scheme: count-based. Not safe under high concurrent write
  // volume (race between count and create) — fine for the current scale,
  // revisit with a dedicated sequence table if that ever becomes real.
  const count = await tenantPrisma.invoice.count();
  return `INV-${String(count + 1).padStart(6, "0")}`;
}

interface CreateInvoiceInput {
  customerId: string;
  dueDate: Date;
  items: { productId?: string; description: string; quantity: number; unitPrice: number; discount: number; tax: number }[];
}

// Draft invoices never touch inventory — per docs/requirements-qa.md, stock
// is only deducted at an explicit fulfillment event (fulfillInvoice below).
export async function createInvoice(tenantPrisma: PrismaClient, tenantId: string, input: CreateInvoiceInput) {
  const totals = computeInvoiceTotals(input.items);
  const invoiceNumber = await generateInvoiceNumber(tenantPrisma);

  return tenantPrisma.invoice.create({
    data: {
      tenantId,
      customerId: input.customerId,
      invoiceNumber,
      dueDate: input.dueDate,
      subtotal: totals.subtotal,
      discount: totals.discount,
      tax: totals.tax,
      total: totals.total,
      balanceDue: totals.total,
      status: "DRAFT",
      items: {
        create: input.items.map((item) => ({
          productId: item.productId,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discount: item.discount,
          tax: item.tax,
          total: lineTotal(item),
        })),
      },
    },
    include: { items: true },
  });
}

export function listInvoices(tenantPrisma: PrismaClient) {
  return tenantPrisma.invoice.findMany({ orderBy: { createdAt: "desc" } });
}

export async function getInvoice(tenantPrisma: PrismaClient, id: string) {
  const invoice = await tenantPrisma.invoice.findUnique({ where: { id }, include: { items: true } });
  if (!invoice) throw new AppError(404, "INVOICE_NOT_FOUND", "Invoice not found");
  return invoice;
}

export async function sendInvoice(tenantPrisma: PrismaClient, id: string) {
  const invoice = await tenantPrisma.invoice.findUnique({ where: { id } });
  if (!invoice) throw new AppError(404, "INVOICE_NOT_FOUND", "Invoice not found");
  if (invoice.status !== "DRAFT") {
    throw new AppError(409, "INVALID_INVOICE_STATE", `Invoice is ${invoice.status}, expected DRAFT`);
  }
  return tenantPrisma.invoice.update({ where: { id }, data: { status: "SENT" } });
}

interface RecordPaymentInput {
  amount: number;
  paymentMethod: "CASH" | "CARD" | "BANK" | "MOBILE_PAYMENT" | "CHEQUE" | "OTHER";
  transactionReference?: string;
}

export async function recordPayment(
  tenantPrisma: PrismaClient,
  tenantId: string,
  invoiceId: string,
  input: RecordPaymentInput,
  userId: string,
) {
  return tenantPrisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) throw new AppError(404, "INVOICE_NOT_FOUND", "Invoice not found");
    if (invoice.status === "DRAFT" || invoice.status === "CANCELLED") {
      throw new AppError(409, "INVALID_INVOICE_STATE", `Cannot record a payment against a ${invoice.status} invoice`);
    }

    const payment = await tx.payment.create({
      data: {
        tenantId,
        referenceType: "INVOICE",
        referenceId: invoiceId,
        paymentMethod: input.paymentMethod,
        amount: input.amount,
        transactionReference: input.transactionReference,
        createdBy: userId,
      },
    });

    const paidAmount = Number(invoice.paidAmount) + input.amount;
    const balanceDue = Number(invoice.total) - paidAmount;
    const status = balanceDue <= 0 ? "PAID" : "PARTIALLY_PAID";

    const updated = await tx.invoice.update({
      where: { id: invoiceId },
      data: { paidAmount, balanceDue: Math.max(0, balanceDue), status },
    });

    await emitAccountingEvent(tx, tenantId, {
      eventType: "PAYMENT_RECEIVED",
      referenceType: "INVOICE",
      referenceId: invoiceId,
      amount: input.amount,
      payload: { paymentId: payment.id, paymentMethod: input.paymentMethod },
    });

    return { payment, invoice: updated };
  });
}

// The one explicit "fulfillment" event that deducts inventory for a B2B
// invoice — per docs/requirements-qa.md, invoice posting itself never does.
export async function fulfillInvoice(
  tenantPrisma: PrismaClient,
  tenantId: string,
  invoiceId: string,
  warehouseId: string,
  userId: string,
) {
  return tenantPrisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findUnique({ where: { id: invoiceId }, include: { items: true } });
    if (!invoice) throw new AppError(404, "INVOICE_NOT_FOUND", "Invoice not found");
    if (invoice.status === "DRAFT" || invoice.status === "CANCELLED") {
      throw new AppError(409, "INVALID_INVOICE_STATE", `Cannot fulfill a ${invoice.status} invoice`);
    }
    if (invoice.fulfilledAt) {
      throw new AppError(409, "ALREADY_FULFILLED", "This invoice has already been fulfilled");
    }

    for (const item of invoice.items) {
      if (!item.productId) continue; // free-text lines (services, fees) carry no stock
      await issueStockCore(
        tx,
        tenantId,
        {
          productId: item.productId,
          warehouseId,
          quantity: Number(item.quantity),
          movementType: "SALE",
          allowNegative: false,
          referenceType: "INVOICE",
          referenceId: invoice.id,
        },
        userId,
      );
    }

    return tx.invoice.update({ where: { id: invoiceId }, data: { fulfilledAt: new Date() } });
  });
}

export async function cancelInvoice(tenantPrisma: PrismaClient, id: string) {
  const invoice = await tenantPrisma.invoice.findUnique({ where: { id } });
  if (!invoice) throw new AppError(404, "INVOICE_NOT_FOUND", "Invoice not found");
  if (invoice.status !== "DRAFT" && invoice.status !== "SENT") {
    throw new AppError(
      409,
      "INVALID_INVOICE_STATE",
      `Cannot cancel a ${invoice.status} invoice directly — use a credit note instead`,
    );
  }
  if (invoice.fulfilledAt) {
    throw new AppError(409, "ALREADY_FULFILLED", "Cannot cancel a fulfilled invoice — use a credit note instead");
  }
  return tenantPrisma.invoice.update({ where: { id }, data: { status: "CANCELLED" } });
}

// --- Credit notes ----------------------------------------------------------

interface CreateCreditNoteInput {
  customerId: string;
  invoiceId?: string;
  amount: number;
  reason: string;
  linkedReturn: boolean;
  refundAmount?: number;
  warehouseId?: string;
  returnItems?: { productId: string; quantity: number }[];
}

export async function createCreditNote(
  tenantPrisma: PrismaClient,
  tenantId: string,
  input: CreateCreditNoteInput,
  userId: string,
) {
  if (input.linkedReturn && (!input.warehouseId || !input.returnItems?.length)) {
    throw new AppError(400, "VALIDATION_ERROR", "linkedReturn requires warehouseId and returnItems");
  }

  return tenantPrisma.$transaction(async (tx) => {
    const count = await tx.creditNote.count();
    const creditNoteNumber = `CN-${String(count + 1).padStart(6, "0")}`;

    const creditNote = await tx.creditNote.create({
      data: {
        tenantId,
        customerId: input.customerId,
        invoiceId: input.invoiceId,
        creditNoteNumber,
        amount: input.amount,
        reason: input.reason,
        linkedReturn: input.linkedReturn,
        refundAmount: input.refundAmount,
      },
    });

    if (input.invoiceId) {
      const invoice = await tx.invoice.findUnique({ where: { id: input.invoiceId } });
      if (invoice) {
        const balanceDue = Math.max(0, Number(invoice.balanceDue) - input.amount);
        const status = balanceDue <= 0 && invoice.status !== "DRAFT" ? "PAID" : invoice.status;
        await tx.invoice.update({ where: { id: input.invoiceId }, data: { balanceDue, status } });
      }
    }

    if (input.linkedReturn && input.warehouseId && input.returnItems) {
      for (const item of input.returnItems) {
        await receiveStockCore(
          tx,
          tenantId,
          {
            productId: item.productId,
            warehouseId: input.warehouseId,
            quantity: item.quantity,
            unitCost: 0, // returned-stock valuation follows the destination's existing average cost
            movementType: "SALES_RETURN",
            referenceType: "CREDIT_NOTE",
            referenceId: creditNote.id,
          },
          userId,
        );
      }
    }

    await emitAccountingEvent(tx, tenantId, {
      eventType: "CREDIT_NOTE_ISSUED",
      referenceType: "CREDIT_NOTE",
      referenceId: creditNote.id,
      amount: input.amount,
      payload: { invoiceId: input.invoiceId, linkedReturn: input.linkedReturn, refundAmount: input.refundAmount },
    });

    return creditNote;
  });
}

// --- Recurring invoices -----------------------------------------------------

interface CreateRecurringTemplateInput {
  customerId: string;
  frequency: "WEEKLY" | "MONTHLY" | "YEARLY";
  startDate: Date;
  endDate?: Date;
  amount: number;
  description: string;
  autoSend: boolean;
}

export function createRecurringTemplate(
  tenantPrisma: PrismaClient,
  tenantId: string,
  input: CreateRecurringTemplateInput,
) {
  return tenantPrisma.recurringInvoiceTemplate.create({
    data: { tenantId, ...input, nextInvoiceDate: input.startDate },
  });
}

export function listRecurringTemplates(tenantPrisma: PrismaClient) {
  return tenantPrisma.recurringInvoiceTemplate.findMany({ orderBy: { createdAt: "desc" } });
}

function advance(date: Date, frequency: string): Date {
  const next = new Date(date);
  if (frequency === "WEEKLY") next.setDate(next.getDate() + 7);
  else if (frequency === "MONTHLY") next.setMonth(next.getMonth() + 1);
  else next.setFullYear(next.getFullYear() + 1);
  return next;
}

// Generates DRAFT invoices (or SENT, if the template has opted into
// auto-send) for every due recurring template. No cron/scheduler wires this
// up yet — see scripts/generateRecurringInvoices.ts for a manually-triggered
// runner; a real background-job scheduler (Redis Queue/RabbitMQ per
// docs/SRS.md §11.25) is a follow-up, not built yet.
export async function generateDueRecurringInvoices(tenantPrisma: PrismaClient, tenantId: string) {
  const due = await tenantPrisma.recurringInvoiceTemplate.findMany({
    where: { status: "ACTIVE", nextInvoiceDate: { lte: new Date() } },
  });

  const created = [];
  for (const template of due) {
    const invoice = await createInvoice(tenantPrisma, tenantId, {
      customerId: template.customerId,
      dueDate: advance(new Date(), "WEEKLY"), // default 7-day payment term; not the recurrence interval
      items: [{ description: template.description, quantity: 1, unitPrice: Number(template.amount), discount: 0, tax: 0 }],
    });

    if (template.autoSend) {
      await sendInvoice(tenantPrisma, invoice.id);
    }

    const nextInvoiceDate = advance(template.nextInvoiceDate, template.frequency);
    const ended = template.endDate && nextInvoiceDate > template.endDate;
    await tenantPrisma.recurringInvoiceTemplate.update({
      where: { id: template.id },
      data: { nextInvoiceDate, status: ended ? "ENDED" : "ACTIVE" },
    });

    created.push(invoice);
  }
  return created;
}
