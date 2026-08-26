import type { PrismaClient, Prisma, Invoice } from "../../generated/tenant-client/client";
import { AppError } from "../../utils/errors";
import { emitAccountingEvent } from "../accounting/accounting.service";
import { receiveStockCore, issueStockCore } from "../inventory/inventory.service";
import { computeInvoiceTotals, isOverdue, lineTotal } from "./invoicing.totals";

export { isOverdue, computeInvoiceTotals };

type Db = PrismaClient | Prisma.TransactionClient;

export function toInvoiceResponse(
  invoice: Invoice & { items?: unknown; payments?: unknown[]; overdue?: boolean },
  rootDomain: string,
) {
  return {
    ...invoice,
    overdue: isOverdue(invoice),
    // Default QR/payment-link target per docs/requirements-qa.md — no real
    // payment gateway wired up yet, so this points at a page that doesn't
    // exist. Needs a provider decision before it's a real payment flow.
    paymentLink: `https://${rootDomain}/pay/${invoice.id}`,
    payments: invoice.payments ?? [],
  };
}

async function generateInvoiceNumber(db: Db): Promise<string> {
  // Simple v1 scheme: count-based. Not safe under high concurrent write
  // volume (race between count and create) — fine for the current scale,
  // revisit with a dedicated sequence table if that ever becomes real.
  const count = await db.invoice.count();
  return `INV-${String(count + 1).padStart(6, "0")}`;
}

interface CreateInvoiceInput {
  customerId: string;
  dueDate: Date;
  items: { productId?: string; description: string; quantity: number; unitPrice: number; discount: number; tax: number }[];
  source?: string;
}

export async function createInvoiceCore(db: Db, tenantId: string, input: CreateInvoiceInput) {
  const totals = computeInvoiceTotals(input.items);
  const invoiceNumber = await generateInvoiceNumber(db);

  return db.invoice.create({
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
      source: input.source ?? "MANUAL",
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

// Draft invoices never touch inventory — per docs/requirements-qa.md, stock
// is only deducted at an explicit fulfillment event (fulfillInvoice below).
export async function createInvoice(tenantPrisma: PrismaClient, tenantId: string, input: CreateInvoiceInput) {
  return createInvoiceCore(tenantPrisma, tenantId, input);
}

export async function updateInvoice(
  tenantPrisma: PrismaClient,
  id: string,
  input: Partial<CreateInvoiceInput> & { items?: CreateInvoiceInput["items"] },
) {
  const existing = await tenantPrisma.invoice.findUnique({ where: { id }, include: { items: true } });
  if (!existing) throw new AppError(404, "INVOICE_NOT_FOUND", "Invoice not found");
  if (existing.status !== "DRAFT") {
    throw new AppError(409, "INVALID_INVOICE_STATE", `Only DRAFT invoices can be edited; status is ${existing.status}`);
  }

  const items = input.items ?? existing.items.map((item) => ({
    productId: item.productId ?? undefined,
    description: item.description,
    quantity: Number(item.quantity),
    unitPrice: Number(item.unitPrice),
    discount: Number(item.discount),
    tax: Number(item.tax),
  }));
  const totals = computeInvoiceTotals(items);

  return tenantPrisma.$transaction(async (tx) => {
    await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });
    return tx.invoice.update({
      where: { id },
      data: {
        customerId: input.customerId ?? existing.customerId,
        dueDate: input.dueDate ?? existing.dueDate,
        subtotal: totals.subtotal,
        discount: totals.discount,
        tax: totals.tax,
        total: totals.total,
        balanceDue: totals.total,
        items: {
          create: items.map((item) => ({
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
  });
}

export async function listInvoices(tenantPrisma: PrismaClient) {
  const [invoices, payments] = await Promise.all([
    tenantPrisma.invoice.findMany({ include: { items: true }, orderBy: { createdAt: "desc" } }),
    tenantPrisma.payment.findMany({ where: { referenceType: "INVOICE" }, orderBy: { paymentDate: "desc" } }),
  ]);
  const byInvoice = new Map<string, typeof payments>();
  for (const payment of payments) {
    const list = byInvoice.get(payment.referenceId) ?? [];
    list.push(payment);
    byInvoice.set(payment.referenceId, list);
  }
  return invoices.map((invoice) => ({ ...invoice, payments: byInvoice.get(invoice.id) ?? [] }));
}

export async function getInvoice(tenantPrisma: PrismaClient, id: string) {
  const invoice = await tenantPrisma.invoice.findUnique({
    where: { id },
    include: { items: true, fulfillments: { include: { lines: true }, orderBy: { fulfilledAt: "desc" } } },
  });
  if (!invoice) throw new AppError(404, "INVOICE_NOT_FOUND", "Invoice not found");
  const payments = await tenantPrisma.payment.findMany({
    where: { referenceType: "INVOICE", referenceId: id },
    orderBy: { paymentDate: "desc" },
  });
  return { ...invoice, payments };
}

export async function sendInvoice(tenantPrisma: PrismaClient, id: string) {
  const invoice = await tenantPrisma.invoice.findUnique({ where: { id } });
  if (!invoice) throw new AppError(404, "INVOICE_NOT_FOUND", "Invoice not found");
  if (invoice.status !== "DRAFT") {
    throw new AppError(409, "INVALID_INVOICE_STATE", `Invoice is ${invoice.status}, expected DRAFT`);
  }
  return tenantPrisma.invoice.update({
    where: { id },
    data: { status: "SENT", sentAt: new Date() },
    include: { items: true },
  });
}

/** Records a payment reminder for a sent / partially-paid invoice (no email provider yet). */
export async function sendInvoiceReminder(tenantPrisma: PrismaClient, id: string) {
  const invoice = await getInvoice(tenantPrisma, id);
  if (invoice.status !== "SENT" && invoice.status !== "PARTIALLY_PAID") {
    throw new AppError(
      409,
      "INVALID_INVOICE_STATE",
      `Reminders require SENT or PARTIALLY_PAID; invoice is ${invoice.status}`,
    );
  }
  const updated = await tenantPrisma.invoice.update({
    where: { id },
    data: { lastReminderAt: new Date() },
    include: { items: true },
  });
  const payments = await tenantPrisma.payment.findMany({
    where: { referenceType: "INVOICE", referenceId: id },
    orderBy: { paymentDate: "desc" },
  });
  return { ...updated, payments };
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
// Supports partial shipments; negative stock is allowed and flagged.
export async function fulfillInvoiceCore(
  tx: Db,
  tenantId: string,
  invoiceId: string,
  input: {
    warehouseId: string;
    lines?: { invoiceItemId: string; quantity: number }[];
    generateDeliveryNote?: boolean;
    notes?: string;
    trigger?: "MANUAL" | "DELIVERY_NOTE" | "POS_AUTO";
    skipStockMovement?: boolean;
    forcePendingProductIds?: string[];
  },
  userId: string,
) {
    const invoice = await tx.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        items: true,
        fulfillments: { include: { lines: true } },
      },
    });
    if (!invoice) throw new AppError(404, "INVOICE_NOT_FOUND", "Invoice not found");
    if (invoice.status === "DRAFT" || invoice.status === "CANCELLED") {
      throw new AppError(409, "INVALID_INVOICE_STATE", `Cannot fulfill a ${invoice.status} invoice`);
    }

    const productItems = invoice.items.filter((item) => item.productId);
    if (productItems.length === 0) {
      throw new AppError(400, "NO_FULFILLABLE_LINES", "Invoice has no product-linked lines to fulfill");
    }

    const alreadyByItem = new Map<string, number>();
    for (const f of invoice.fulfillments) {
      for (const line of f.lines) {
        alreadyByItem.set(line.invoiceItemId, (alreadyByItem.get(line.invoiceItemId) ?? 0) + Number(line.quantity));
      }
    }

    const requested =
      input.lines?.length
        ? input.lines
        : productItems.map((item) => ({
            invoiceItemId: item.id,
            quantity: Math.max(0, Number(item.quantity) - (alreadyByItem.get(item.id) ?? 0)),
          }));

    const shipLines: {
      invoiceItemId: string;
      productId: string;
      quantity: number;
    }[] = [];

    for (const req of requested) {
      if (req.quantity <= 0) continue;
      const item = productItems.find((i) => i.id === req.invoiceItemId);
      if (!item || !item.productId) {
        throw new AppError(400, "INVALID_LINE", `Invoice item ${req.invoiceItemId} is not fulfillable`);
      }
      const remaining = Number(item.quantity) - (alreadyByItem.get(item.id) ?? 0);
      if (req.quantity > remaining + 1e-9) {
        throw new AppError(
          409,
          "OVER_FULFILL",
          `Cannot fulfill ${req.quantity} of item ${item.description}; only ${remaining} remaining`,
        );
      }
      shipLines.push({ invoiceItemId: item.id, productId: item.productId, quantity: req.quantity });
    }

    if (shipLines.length === 0) {
      throw new AppError(409, "NOTHING_TO_FULFILL", "No remaining quantity to fulfill");
    }

    const trigger =
      input.trigger ?? (input.generateDeliveryNote ? "DELIVERY_NOTE" : "MANUAL");
    let deliveryNoteNumber: string | undefined;
    if (trigger === "DELIVERY_NOTE" || input.generateDeliveryNote) {
      const dnCount = await tx.invoiceFulfillment.count({
        where: { deliveryNoteNumber: { not: null } },
      });
      deliveryNoteNumber = `DN-${String(dnCount + 1).padStart(4, "0")}`;
    }

    const pendingSet = new Set(input.forcePendingProductIds ?? []);
    const fulfillmentLines: {
      invoiceItemId: string;
      productId: string;
      warehouseId: string;
      quantity: number;
      status: string;
    }[] = [];

    for (const line of shipLines) {
      let goesNegative = pendingSet.has(line.productId);
      if (!input.skipStockMovement) {
        const before = await tx.stockBalance.findUnique({
          where: { warehouseId_productId: { warehouseId: input.warehouseId, productId: line.productId } },
        });
        const availableBefore = before ? Number(before.quantity) : 0;
        goesNegative = goesNegative || line.quantity > availableBefore;

        await issueStockCore(
          tx,
          tenantId,
          {
            productId: line.productId,
            warehouseId: input.warehouseId,
            quantity: line.quantity,
            movementType: "SALE",
            allowNegative: true,
            referenceType: "INVOICE",
            referenceId: invoice.id,
          },
          userId,
        );
      }

      fulfillmentLines.push({
        invoiceItemId: line.invoiceItemId,
        productId: line.productId,
        warehouseId: input.warehouseId,
        quantity: line.quantity,
        status: goesNegative ? "PENDING_RECONCILIATION" : "FULFILLED",
      });
    }

    const fulfillment = await tx.invoiceFulfillment.create({
      data: {
        tenantId,
        invoiceId: invoice.id,
        trigger: input.generateDeliveryNote ? "DELIVERY_NOTE" : trigger,
        deliveryNoteNumber,
        notes: input.notes,
        fulfilledBy: userId,
        lines: { create: fulfillmentLines },
      },
      include: { lines: true },
    });

    // Recompute remaining across all fulfillments including this one
    const allFulfillments = await tx.invoiceFulfillment.findMany({
      where: { invoiceId: invoice.id },
      include: { lines: true },
    });
    const fulfilledQty = new Map<string, number>();
    for (const f of allFulfillments) {
      for (const line of f.lines) {
        fulfilledQty.set(line.invoiceItemId, (fulfilledQty.get(line.invoiceItemId) ?? 0) + Number(line.quantity));
      }
    }
    const fullyFulfilled = productItems.every(
      (item) => (fulfilledQty.get(item.id) ?? 0) >= Number(item.quantity) - 1e-9,
    );

    const updatedInvoice = await tx.invoice.update({
      where: { id: invoice.id },
      data: fullyFulfilled ? { fulfilledAt: new Date() } : {},
      include: { items: true, fulfillments: { include: { lines: true }, orderBy: { fulfilledAt: "desc" } } },
    });

    return { invoice: updatedInvoice, fulfillment };
}

export async function fulfillInvoice(
  tenantPrisma: PrismaClient,
  tenantId: string,
  invoiceId: string,
  input: {
    warehouseId: string;
    lines?: { invoiceItemId: string; quantity: number }[];
    generateDeliveryNote?: boolean;
    notes?: string;
    trigger?: "MANUAL" | "DELIVERY_NOTE" | "POS_AUTO";
    skipStockMovement?: boolean;
    forcePendingProductIds?: string[];
  },
  userId: string,
) {
  return tenantPrisma.$transaction((tx) => fulfillInvoiceCore(tx, tenantId, invoiceId, input, userId));
}

export function listFulfillments(tenantPrisma: PrismaClient, invoiceId?: string) {
  return tenantPrisma.invoiceFulfillment.findMany({
    where: invoiceId ? { invoiceId } : undefined,
    include: { lines: true, invoice: { include: { items: true } } },
    orderBy: { fulfilledAt: "desc" },
  });
}

export async function listPendingReconciliation(tenantPrisma: PrismaClient) {
  return tenantPrisma.invoiceFulfillmentLine.findMany({
    where: { status: "PENDING_RECONCILIATION" },
    include: { fulfillment: true },
    orderBy: { fulfillment: { fulfilledAt: "desc" } },
  });
}

/** Clears a pending-reconciliation flag after stock has been corrected. */
export async function reconcileFulfillmentLine(tenantPrisma: PrismaClient, lineId: string) {
  const line = await tenantPrisma.invoiceFulfillmentLine.findUnique({
    where: { id: lineId },
    include: { fulfillment: true },
  });
  if (!line) throw new AppError(404, "FULFILLMENT_LINE_NOT_FOUND", "Fulfillment line not found");
  if (line.status !== "PENDING_RECONCILIATION") {
    throw new AppError(409, "NOT_PENDING", "Line is not pending reconciliation");
  }
  return tenantPrisma.invoiceFulfillmentLine.update({
    where: { id: lineId },
    data: { status: "FULFILLED" },
    include: { fulfillment: true },
  });
}

/**
 * POS auto-fulfill: records a full shipment for an invoice with trigger POS_AUTO.
 * When skipStockMovement is true (stock already deducted by the sale), only
 * fulfillment rows are written — no second inventory issue.
 */
export async function autoFulfillPos(
  db: Db,
  tenantId: string,
  invoiceId: string,
  warehouseId: string,
  userId: string,
  opts?: { skipStockMovement?: boolean; pendingProductIds?: string[] },
) {
  return fulfillInvoiceCore(
    db,
    tenantId,
    invoiceId,
    {
      warehouseId,
      trigger: "POS_AUTO",
      skipStockMovement: opts?.skipStockMovement,
      forcePendingProductIds: opts?.pendingProductIds,
    },
    userId,
  );
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

export function listCreditNotes(tenantPrisma: PrismaClient) {
  return tenantPrisma.creditNote.findMany({ orderBy: { createdAt: "desc" } });
}

export async function voidCreditNote(tenantPrisma: PrismaClient, id: string) {
  const note = await tenantPrisma.creditNote.findUnique({ where: { id } });
  if (!note) throw new AppError(404, "CREDIT_NOTE_NOT_FOUND", "Credit note not found");
  if (note.status === "VOID") throw new AppError(409, "ALREADY_VOID", "Credit note is already void");

  return tenantPrisma.$transaction(async (tx) => {
    if (note.invoiceId) {
      const invoice = await tx.invoice.findUnique({ where: { id: note.invoiceId } });
      if (invoice && invoice.status !== "CANCELLED") {
        const balanceDue = Number(invoice.balanceDue) + Number(note.amount);
        const status =
          balanceDue <= 0
            ? "PAID"
            : Number(invoice.paidAmount) > 0
              ? "PARTIALLY_PAID"
              : invoice.status === "PAID"
                ? "SENT"
                : invoice.status;
        await tx.invoice.update({
          where: { id: note.invoiceId },
          data: { balanceDue, status: balanceDue > 0 && invoice.status === "PAID" ? "PARTIALLY_PAID" : status },
        });
      }
    }
    return tx.creditNote.update({ where: { id }, data: { status: "VOID" } });
  });
}

interface CreateDebitNoteInput {
  customerId: string;
  invoiceId?: string;
  amount: number;
  reason: string;
}

export async function createDebitNote(
  tenantPrisma: PrismaClient,
  tenantId: string,
  input: CreateDebitNoteInput,
) {
  return tenantPrisma.$transaction(async (tx) => {
    const count = await tx.debitNote.count();
    const debitNoteNumber = `DN-${String(count + 1).padStart(6, "0")}`;
    const debitNote = await tx.debitNote.create({
      data: {
        tenantId,
        customerId: input.customerId,
        invoiceId: input.invoiceId,
        debitNoteNumber,
        amount: input.amount,
        reason: input.reason,
      },
    });

    if (input.invoiceId) {
      const invoice = await tx.invoice.findUnique({ where: { id: input.invoiceId } });
      if (invoice && invoice.status !== "CANCELLED" && invoice.status !== "DRAFT") {
        const balanceDue = Number(invoice.balanceDue) + input.amount;
        const total = Number(invoice.total) + input.amount;
        await tx.invoice.update({
          where: { id: input.invoiceId },
          data: {
            balanceDue,
            total,
            status: Number(invoice.paidAmount) > 0 ? "PARTIALLY_PAID" : "SENT",
          },
        });
      }
    }

    return debitNote;
  });
}

export function listDebitNotes(tenantPrisma: PrismaClient) {
  return tenantPrisma.debitNote.findMany({ orderBy: { createdAt: "desc" } });
}

export async function voidDebitNote(tenantPrisma: PrismaClient, id: string) {
  const note = await tenantPrisma.debitNote.findUnique({ where: { id } });
  if (!note) throw new AppError(404, "DEBIT_NOTE_NOT_FOUND", "Debit note not found");
  if (note.status === "VOID") throw new AppError(409, "ALREADY_VOID", "Debit note is already void");

  return tenantPrisma.$transaction(async (tx) => {
    if (note.invoiceId) {
      const invoice = await tx.invoice.findUnique({ where: { id: note.invoiceId } });
      if (invoice && invoice.status !== "CANCELLED") {
        const balanceDue = Math.max(0, Number(invoice.balanceDue) - Number(note.amount));
        const total = Math.max(0, Number(invoice.total) - Number(note.amount));
        const status =
          balanceDue <= 0 && invoice.status !== "DRAFT"
            ? "PAID"
            : Number(invoice.paidAmount) > 0
              ? "PARTIALLY_PAID"
              : invoice.status;
        await tx.invoice.update({ where: { id: note.invoiceId }, data: { balanceDue, total, status } });
      }
    }
    return tx.debitNote.update({ where: { id }, data: { status: "VOID" } });
  });
}

/** Standalone credit/debit note → draft invoice document (every dollar has a document). */
export async function convertNoteToInvoice(
  tenantPrisma: PrismaClient,
  tenantId: string,
  kind: "credit" | "debit",
  noteId: string,
) {
  if (kind === "credit") {
    const note = await tenantPrisma.creditNote.findUnique({ where: { id: noteId } });
    if (!note) throw new AppError(404, "CREDIT_NOTE_NOT_FOUND", "Credit note not found");
    if (note.status !== "ISSUED") throw new AppError(409, "INVALID_NOTE_STATE", "Only issued notes can convert");
    if (note.invoiceId) throw new AppError(409, "ALREADY_LINKED", "Note is already linked to an invoice");

    const invoice = await createInvoice(tenantPrisma, tenantId, {
      customerId: note.customerId,
      dueDate: advance(new Date(), "WEEKLY"),
      source: "CREDIT_NOTE",
      items: [
        {
          description: `${note.creditNoteNumber} — ${note.reason}`,
          quantity: 1,
          unitPrice: -Number(note.amount),
          discount: 0,
          tax: 0,
        },
      ],
    });
    await tenantPrisma.creditNote.update({ where: { id: noteId }, data: { invoiceId: invoice.id } });
    return getInvoice(tenantPrisma, invoice.id);
  }

  const note = await tenantPrisma.debitNote.findUnique({ where: { id: noteId } });
  if (!note) throw new AppError(404, "DEBIT_NOTE_NOT_FOUND", "Debit note not found");
  if (note.status !== "ISSUED") throw new AppError(409, "INVALID_NOTE_STATE", "Only issued notes can convert");
  if (note.invoiceId) throw new AppError(409, "ALREADY_LINKED", "Note is already linked to an invoice");

  const invoice = await createInvoice(tenantPrisma, tenantId, {
    customerId: note.customerId,
    dueDate: advance(new Date(), "WEEKLY"),
    source: "DEBIT_NOTE",
    items: [
      {
        description: `${note.debitNoteNumber} — ${note.reason}`,
        quantity: 1,
        unitPrice: Number(note.amount),
        discount: 0,
        tax: 0,
      },
    ],
  });
  await tenantPrisma.debitNote.update({ where: { id: noteId }, data: { invoiceId: invoice.id } });
  return getInvoice(tenantPrisma, invoice.id);
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
  kind?: "INVOICE" | "RETAINER_TOPUP";
  retainerId?: string;
}

export function createRecurringTemplate(
  tenantPrisma: PrismaClient,
  tenantId: string,
  input: CreateRecurringTemplateInput,
) {
  return tenantPrisma.recurringInvoiceTemplate.create({
    data: {
      tenantId,
      customerId: input.customerId,
      frequency: input.frequency,
      startDate: input.startDate,
      nextInvoiceDate: input.startDate,
      endDate: input.endDate,
      amount: input.amount,
      description: input.description,
      autoSend: input.autoSend,
      kind: input.kind ?? "INVOICE",
      retainerId: input.retainerId,
    },
  });
}

export function listRecurringTemplates(tenantPrisma: PrismaClient) {
  return tenantPrisma.recurringInvoiceTemplate.findMany({ orderBy: { createdAt: "desc" } });
}

export async function setRecurringTemplateStatus(
  tenantPrisma: PrismaClient,
  templateId: string,
  status: "ACTIVE" | "PAUSED",
) {
  const template = await tenantPrisma.recurringInvoiceTemplate.findUnique({ where: { id: templateId } });
  if (!template) throw new AppError(404, "TEMPLATE_NOT_FOUND", "Recurring template not found");
  if (template.status === "ENDED") {
    throw new AppError(409, "TEMPLATE_ENDED", "Cannot change status of an ended template");
  }
  return tenantPrisma.recurringInvoiceTemplate.update({ where: { id: templateId }, data: { status } });
}

interface UpdateRecurringTemplateInput {
  customerId?: string;
  frequency?: "WEEKLY" | "MONTHLY" | "YEARLY";
  startDate?: Date;
  nextInvoiceDate?: Date;
  endDate?: Date | null;
  amount?: number;
  description?: string;
  autoSend?: boolean;
}

export async function updateRecurringTemplate(
  tenantPrisma: PrismaClient,
  templateId: string,
  input: UpdateRecurringTemplateInput,
) {
  const template = await tenantPrisma.recurringInvoiceTemplate.findUnique({ where: { id: templateId } });
  if (!template) throw new AppError(404, "TEMPLATE_NOT_FOUND", "Recurring template not found");
  if (template.status === "ENDED") {
    throw new AppError(409, "TEMPLATE_ENDED", "Cannot edit an ended template");
  }

  return tenantPrisma.recurringInvoiceTemplate.update({
    where: { id: templateId },
    data: {
      customerId: input.customerId,
      frequency: input.frequency,
      startDate: input.startDate,
      nextInvoiceDate: input.nextInvoiceDate,
      endDate: input.endDate,
      amount: input.amount,
      description: input.description,
      autoSend: input.autoSend,
    },
  });
}

export async function deleteRecurringTemplate(tenantPrisma: PrismaClient, templateId: string) {
  const template = await tenantPrisma.recurringInvoiceTemplate.findUnique({ where: { id: templateId } });
  if (!template) throw new AppError(404, "TEMPLATE_NOT_FOUND", "Recurring template not found");
  await tenantPrisma.recurringInvoiceTemplate.delete({ where: { id: templateId } });
  return { deleted: true, id: templateId };
}

function advance(date: Date, frequency: string): Date {
  const next = new Date(date);
  if (frequency === "WEEKLY") next.setDate(next.getDate() + 7);
  else if (frequency === "MONTHLY") next.setMonth(next.getMonth() + 1);
  else next.setFullYear(next.getFullYear() + 1);
  return next;
}

/** Generate the next invoice for a single template (manual UI trigger). */
export async function generateRecurringTemplate(
  tenantPrisma: PrismaClient,
  tenantId: string,
  templateId: string,
  userId?: string,
) {
  const template = await tenantPrisma.recurringInvoiceTemplate.findUnique({ where: { id: templateId } });
  if (!template) throw new AppError(404, "TEMPLATE_NOT_FOUND", "Recurring template not found");
  if (template.status !== "ACTIVE") {
    throw new AppError(409, "TEMPLATE_NOT_ACTIVE", `Template is ${template.status}, expected ACTIVE`);
  }

  const isTopUp = template.kind === "RETAINER_TOPUP";
  if (isTopUp && !template.retainerId) {
    throw new AppError(400, "RETAINER_REQUIRED", "Retainer top-up template is missing retainerId");
  }

  const invoice = await createInvoice(tenantPrisma, tenantId, {
    customerId: template.customerId,
    dueDate: advance(new Date(), "WEEKLY"),
    source: isTopUp ? "RETAINER_TOPUP" : "RECURRING",
    items: [
      {
        description: template.description,
        quantity: 1,
        unitPrice: Number(template.amount),
        discount: 0,
        tax: 0,
      },
    ],
  });

  // Top-ups are money arriving — mark paid immediately and credit the retainer.
  if (isTopUp && template.retainerId) {
    await tenantPrisma.invoice.update({
      where: { id: invoice.id },
      data: {
        status: "PAID",
        paidAmount: invoice.total,
        balanceDue: 0,
        sentAt: new Date(),
      },
    });
    await tenantPrisma.payment.create({
      data: {
        tenantId,
        amount: invoice.total,
        paymentMethod: "BANK",
        paymentDate: new Date(),
        referenceType: "INVOICE",
        referenceId: invoice.id,
        createdBy: userId,
      },
    });

    const retainer = await tenantPrisma.retainer.findUnique({ where: { id: template.retainerId } });
    if (!retainer) throw new AppError(404, "RETAINER_NOT_FOUND", "Retainer not found");
    const amount = Number(template.amount);
    await tenantPrisma.retainer.update({
      where: { id: template.retainerId },
      data: {
        remainingBalance: Number(retainer.remainingBalance) + amount,
        contractAmount: Number(retainer.contractAmount) + amount,
      },
    });
    await tenantPrisma.retainerUsage.create({
      data: {
        retainerId: template.retainerId,
        date: new Date(),
        amount,
        note: `Top-up via ${invoice.invoiceNumber}`,
      },
    });
  } else if (template.autoSend) {
    await sendInvoice(tenantPrisma, invoice.id);
  }

  const nextInvoiceDate = advance(template.nextInvoiceDate, template.frequency);
  const ended = template.endDate && nextInvoiceDate > template.endDate;
  await tenantPrisma.recurringInvoiceTemplate.update({
    where: { id: template.id },
    data: { nextInvoiceDate, status: ended ? "ENDED" : "ACTIVE" },
  });

  return getInvoice(tenantPrisma, invoice.id);
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
