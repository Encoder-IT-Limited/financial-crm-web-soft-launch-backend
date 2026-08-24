import type { PrismaClient, Prisma } from "../../generated/tenant-client/client";
import { AppError } from "../../utils/errors";
import { logger } from "../../utils/logger";
import { emitAccountingEvent } from "../accounting/accounting.service";
import { issueStockCore, receiveStockCore } from "../inventory/inventory.service";
import { autoFulfillPos, createInvoice } from "../invoicing/invoicing.service";

type Db = PrismaClient | Prisma.TransactionClient;

// --- Terminals -------------------------------------------------------------

export function listTerminals(tenantPrisma: PrismaClient) {
  return tenantPrisma.posTerminal.findMany({ orderBy: { name: "asc" } });
}

export function createTerminal(
  tenantPrisma: PrismaClient,
  tenantId: string,
  input: { name: string; code: string; warehouseId: string; deviceIdentifier?: string },
) {
  return tenantPrisma.posTerminal.create({ data: { tenantId, ...input } });
}

// --- Cashier sessions --------------------------------------------------

export function listSessions(tenantPrisma: PrismaClient, status?: "OPEN" | "CLOSED") {
  return tenantPrisma.posSession.findMany({
    where: status ? { status } : undefined,
    orderBy: { openedAt: "desc" },
    include: { terminal: true },
  });
}

export async function openSession(
  tenantPrisma: PrismaClient,
  tenantId: string,
  input: { terminalId: string; openingCash: number },
  cashierId: string,
) {
  const openAlready = await tenantPrisma.posSession.findFirst({
    where: { terminalId: input.terminalId, status: "OPEN" },
  });
  if (openAlready) {
    throw new AppError(409, "SESSION_ALREADY_OPEN", "This terminal already has an open session");
  }
  return tenantPrisma.posSession.create({
    data: { tenantId, terminalId: input.terminalId, cashierId, openingCash: input.openingCash },
  });
}

// End-of-day cash reconciliation: expectedCash = opening + cash sales - cash
// refunds recorded against this session, variance = what was actually
// counted vs. expected. Per docs/requirements-qa.md ("POS register
// opening/closing and end-of-day cash reconciliation" → yes).
export async function closeSession(tenantPrisma: PrismaClient, sessionId: string, closingCash: number) {
  const session = await tenantPrisma.posSession.findUnique({ where: { id: sessionId } });
  if (!session) throw new AppError(404, "SESSION_NOT_FOUND", "POS session not found");
  if (session.status !== "OPEN") throw new AppError(409, "SESSION_ALREADY_CLOSED", "This session is already closed");

  const sales = await tenantPrisma.sale.findMany({ where: { posSessionId: sessionId }, select: { id: true } });
  const saleIds = sales.map((s) => s.id);

  const cashMovements = saleIds.length
    ? await tenantPrisma.payment.aggregate({
        where: { referenceType: "SALE", referenceId: { in: saleIds }, paymentMethod: "CASH" },
        _sum: { amount: true },
      })
    : { _sum: { amount: null } };

  const cashNet = Number(cashMovements._sum.amount ?? 0);
  const expectedCash = Number(session.openingCash) + cashNet;
  const variance = closingCash - expectedCash;

  return tenantPrisma.posSession.update({
    where: { id: sessionId },
    data: { closingCash, expectedCash, variance, closedAt: new Date(), status: "CLOSED" },
  });
}

// --- Sales -----------------------------------------------------------------

interface SaleItemInput {
  productId: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  tax: number;
}

interface SalePaymentInput {
  paymentMethod: "CASH" | "CARD" | "BANK" | "MOBILE_PAYMENT" | "CHEQUE" | "OTHER";
  amount: number;
  transactionReference?: string;
}

interface CreateSaleInput {
  posSessionId: string;
  customerId?: string;
  items: SaleItemInput[];
  payments: SalePaymentInput[];
  isOfflineSync: boolean;
  deviceId?: string;
  offlineTransactionKey?: string;
  transactionDate?: Date;
}

async function generateTransactionNumber(db: Db): Promise<string> {
  const count = await db.sale.count();
  return `SALE-${String(count + 1).padStart(6, "0")}`;
}

// Idempotency per docs/database-design.md §33.33 Rule 5: a retried offline
// sync of the same (deviceId, offlineTransactionKey) pair must not create a
// second sale — return the original instead of erroring, since from the
// client's perspective this is a successful sync either way.
export async function createSale(
  tenantPrisma: PrismaClient,
  tenantId: string,
  input: CreateSaleInput,
  userId: string,
) {
  if (input.isOfflineSync && input.deviceId && input.offlineTransactionKey) {
    const existing = await tenantPrisma.sale.findUnique({
      where: { deviceId_offlineTransactionKey: { deviceId: input.deviceId, offlineTransactionKey: input.offlineTransactionKey } },
    });
    if (existing) return existing;
  }

  const pendingProductIds: string[] = [];

  const { sale, warehouseId } = await tenantPrisma.$transaction(async (tx) => {
    const session = await tx.posSession.findUnique({ where: { id: input.posSessionId }, include: { terminal: true } });
    if (!session) throw new AppError(404, "SESSION_NOT_FOUND", "POS session not found");
    if (session.status !== "OPEN") throw new AppError(409, "SESSION_CLOSED", "This POS session is closed");

    const subtotal = input.items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
    const discount = input.items.reduce((sum, i) => sum + i.discount, 0);
    const tax = input.items.reduce((sum, i) => sum + i.tax, 0);
    const total = subtotal - discount + tax;

    const paid = input.payments.reduce((sum, p) => sum + p.amount, 0);
    if (Math.abs(paid - total) > 0.01) {
      throw new AppError(400, "PAYMENT_MISMATCH", `Payments total ${paid} do not match sale total ${total}`);
    }

    const transactionNumber = await generateTransactionNumber(tx);
    const saleRow = await tx.sale.create({
      data: {
        tenantId,
        warehouseId: session.terminal.warehouseId,
        customerId: input.customerId,
        posSessionId: input.posSessionId,
        transactionNumber,
        transactionDate: input.transactionDate ?? new Date(),
        subtotal,
        discount,
        tax,
        total,
        deviceId: input.deviceId,
        offlineTransactionKey: input.offlineTransactionKey,
        items: {
          create: input.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discount: item.discount,
            tax: item.tax,
            total: item.quantity * item.unitPrice - item.discount + item.tax,
          })),
        },
      },
      include: { items: true },
    });

    for (const item of input.items) {
      const before = await tx.stockBalance.findUnique({
        where: {
          warehouseId_productId: {
            warehouseId: session.terminal.warehouseId,
            productId: item.productId,
          },
        },
      });
      const available = before ? Number(before.quantity) : 0;
      if (item.quantity > available) pendingProductIds.push(item.productId);

      await issueStockCore(
        tx,
        tenantId,
        {
          productId: item.productId,
          warehouseId: session.terminal.warehouseId,
          quantity: item.quantity,
          movementType: "SALE",
          // Allow negative online + offline; oversells surface as
          // pending-reconciliation on the linked POS invoice fulfillment.
          allowNegative: true,
          referenceType: "SALE",
          referenceId: saleRow.id,
        },
        userId,
      );
    }

    for (const payment of input.payments) {
      await tx.payment.create({
        data: {
          tenantId,
          referenceType: "SALE",
          referenceId: saleRow.id,
          paymentMethod: payment.paymentMethod,
          amount: payment.amount,
          transactionReference: payment.transactionReference,
          createdBy: userId,
        },
      });
    }

    await emitAccountingEvent(tx, tenantId, {
      eventType: "SALE_COMPLETED",
      referenceType: "SALE",
      referenceId: saleRow.id,
      amount: total,
      taxAmount: tax,
      payload: { posSessionId: input.posSessionId, itemCount: input.items.length },
    });

    return { sale: saleRow, warehouseId: session.terminal.warehouseId };
  });

  try {
    await createPosInvoiceAndFulfill(tenantPrisma, tenantId, sale, warehouseId, userId, pendingProductIds);
  } catch (err) {
    logger.warn({ err, saleId: sale.id }, "POS sale invoice/auto-fulfill failed; sale still committed");
  }

  return sale;
}

async function ensureWalkInCustomer(tenantPrisma: PrismaClient, tenantId: string) {
  const existing = await tenantPrisma.customer.findFirst({ where: { customerCode: "WALK-IN" } });
  if (existing) return existing;
  return tenantPrisma.customer.create({
    data: { tenantId, customerCode: "WALK-IN", name: "Walk-in Customer", status: "ACTIVE" },
  });
}

async function createPosInvoiceAndFulfill(
  tenantPrisma: PrismaClient,
  tenantId: string,
  sale: {
    id: string;
    transactionNumber: string;
    customerId: string | null;
    total: unknown;
    items: { productId: string; quantity: unknown; unitPrice: unknown; discount: unknown; tax: unknown }[];
  },
  warehouseId: string,
  userId: string,
  pendingProductIds: string[],
) {
  const customerId = sale.customerId ?? (await ensureWalkInCustomer(tenantPrisma, tenantId)).id;
  const products = await tenantPrisma.product.findMany({
    where: { id: { in: sale.items.map((i) => i.productId) } },
  });
  const nameById = new Map(products.map((p) => [p.id, p.name]));

  const invoice = await createInvoice(tenantPrisma, tenantId, {
    customerId,
    dueDate: new Date(),
    source: "POS",
    items: sale.items.map((item) => ({
      productId: item.productId,
      description: nameById.get(item.productId) ?? "POS item",
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
      discount: Number(item.discount),
      tax: Number(item.tax),
    })),
  });

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
      paymentMethod: "CASH",
      paymentDate: new Date(),
      referenceType: "INVOICE",
      referenceId: invoice.id,
      transactionReference: sale.transactionNumber,
      createdBy: userId,
    },
  });

  await autoFulfillPos(tenantPrisma, tenantId, invoice.id, warehouseId, userId, {
    skipStockMovement: true,
    pendingProductIds,
  });
}

export function listSales(tenantPrisma: PrismaClient, posSessionId?: string) {
  return tenantPrisma.sale.findMany({
    where: posSessionId ? { posSessionId } : undefined,
    orderBy: { createdAt: "desc" },
  });
}

export async function getSale(tenantPrisma: PrismaClient, id: string) {
  const sale = await tenantPrisma.sale.findUnique({ where: { id }, include: { items: true } });
  if (!sale) throw new AppError(404, "SALE_NOT_FOUND", "Sale not found");
  return sale;
}

// --- Refunds / returns / void ---------------------------------------------
// Gated at the route level to OWNER/MANAGER, per docs/requirements-qa.md
// ("manager approval/PIN required for POS discounts, voids, and refunds").

interface RefundItemInput {
  productId: string;
  quantity: number;
  unitPrice: number;
  condition: "SELLABLE" | "DAMAGED";
}

export async function refundSale(
  tenantPrisma: PrismaClient,
  tenantId: string,
  saleId: string,
  items: RefundItemInput[],
  reason: string | undefined,
  userId: string,
) {
  return tenantPrisma.$transaction(async (tx) => {
    const sale = await tx.sale.findUnique({ where: { id: saleId }, include: { items: true } });
    if (!sale) throw new AppError(404, "SALE_NOT_FOUND", "Sale not found");
    if (sale.status !== "COMPLETED" && sale.status !== "PARTIALLY_REFUNDED") {
      throw new AppError(409, "INVALID_SALE_STATE", `Sale is ${sale.status}, cannot refund`);
    }

    const refundAmount = items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);

    const saleReturn = await tx.saleReturn.create({
      data: {
        tenantId,
        saleId,
        warehouseId: sale.warehouseId,
        refundAmount,
        reason,
        items: { create: items },
      },
    });

    for (const item of items) {
      if (item.condition === "SELLABLE") {
        await receiveStockCore(
          tx,
          tenantId,
          {
            productId: item.productId,
            warehouseId: sale.warehouseId,
            quantity: item.quantity,
            unitCost: 0, // restocked at destination's existing average cost
            movementType: "SALES_RETURN",
            referenceType: "SALE_RETURN",
            referenceId: saleReturn.id,
          },
          userId,
        );
      }
      // DAMAGED items are intentionally never restocked — see
      // docs/requirements-qa.md; a manager writes them off separately via
      // the inventory adjustment flow.
    }

    await tx.payment.create({
      data: {
        tenantId,
        referenceType: "SALE",
        referenceId: saleId,
        paymentMethod: "OTHER",
        amount: -refundAmount,
        createdBy: userId,
      },
    });

    const priorReturns = await tx.saleReturnItem.findMany({
      where: { saleReturn: { saleId } },
    });
    const returnedByProduct = new Map<string, number>();
    for (const r of priorReturns) {
      returnedByProduct.set(r.productId, (returnedByProduct.get(r.productId) ?? 0) + Number(r.quantity));
    }
    const fullyReturned = sale.items.every(
      (line) => (returnedByProduct.get(line.productId) ?? 0) >= Number(line.quantity),
    );

    const updated = await tx.sale.update({
      where: { id: saleId },
      data: { status: fullyReturned ? "REFUNDED" : "PARTIALLY_REFUNDED" },
    });

    await emitAccountingEvent(tx, tenantId, {
      eventType: "SALE_REFUNDED",
      referenceType: "SALE",
      referenceId: saleId,
      amount: refundAmount,
      payload: { saleReturnId: saleReturn.id, items },
    });

    return { saleReturn, sale: updated };
  });
}

export async function voidSale(tenantPrisma: PrismaClient, tenantId: string, saleId: string, userId: string) {
  const sale = await tenantPrisma.sale.findUnique({ where: { id: saleId }, include: { items: true } });
  if (!sale) throw new AppError(404, "SALE_NOT_FOUND", "Sale not found");
  if (sale.status !== "COMPLETED") {
    throw new AppError(409, "INVALID_SALE_STATE", "Only a fully COMPLETED sale with no prior refunds can be voided");
  }

  const { saleReturn } = await refundSale(
    tenantPrisma,
    tenantId,
    saleId,
    sale.items.map((item) => ({
      productId: item.productId,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
      condition: "SELLABLE" as const,
    })),
    "Voided",
    userId,
  );

  // refundSale always resolves a full-quantity refund to REFUNDED; a void is
  // the same reversal but recorded distinctly so it doesn't read as an
  // ordinary customer-initiated refund.
  const updated = await tenantPrisma.sale.update({ where: { id: saleId }, data: { status: "VOIDED" } });
  return { saleReturn, sale: updated };
}
