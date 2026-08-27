import type { PrismaClient, Prisma } from "../../generated/tenant-client/client";
import { AppError } from "../../utils/errors";
import { resolveCurrency } from "../../utils/currency";
import { emitAccountingEvent } from "../accounting/accounting.service";
import { issueStockCore, receiveStockCore, quarantineStockCore, lookupProductByBarcode } from "../inventory/inventory.service";
import { autoFulfillPos, createInvoiceCore } from "../invoicing/invoicing.service";
import { roundMoney } from "../invoicing/invoicing.totals";
import { hashManagerPin, assertManagerApproval, MANAGER_PIN_ROLES } from "./pos.pin";
import { discountFromRule, taxFromRate, lineTotal } from "./pos.pricing";
import { saleListWhere, sessionListWhere, type SaleListFilters, type SessionListFilters } from "./pos.salesWhere";
import bcrypt from "bcrypt";

type Db = PrismaClient | Prisma.TransactionClient;

type Actor = { id: string; role: string };

export async function listTerminals(tenantPrisma: PrismaClient, status?: "ACTIVE" | "INACTIVE") {
  const rows = await tenantPrisma.posTerminal.findMany({
    where: status ? { status } : undefined,
    orderBy: { name: "asc" },
  });
  return rows.map(publicTerminal);
}

function publicTerminal<T extends { accessCodeHash?: string | null }>(row: T) {
  const { accessCodeHash: _, ...rest } = row;
  return { ...rest, hasAccessCode: Boolean(row.accessCodeHash) };
}

export async function createTerminal(
  tenantPrisma: PrismaClient,
  tenantId: string,
  input: { name: string; code: string; warehouseId: string; deviceIdentifier?: string; accessCode: string },
) {
  const { accessCode, ...fields } = input;
  const row = await tenantPrisma.posTerminal.create({
    data: {
      tenantId,
      ...fields,
      accessCodeHash: await bcrypt.hash(accessCode, 10),
    },
  });
  return publicTerminal(row);
}

export async function updateTerminal(
  tenantPrisma: PrismaClient,
  id: string,
  input: {
    name?: string;
    code?: string;
    warehouseId?: string;
    deviceIdentifier?: string | null;
    accessCode?: string;
    status?: "ACTIVE" | "INACTIVE";
  },
) {
  const existing = await tenantPrisma.posTerminal.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "TERMINAL_NOT_FOUND", "POS terminal not found");

  const data: Prisma.PosTerminalUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.code !== undefined) data.code = input.code;
  if (input.warehouseId !== undefined) data.warehouseId = input.warehouseId;
  if (input.deviceIdentifier !== undefined) data.deviceIdentifier = input.deviceIdentifier;
  if (input.status !== undefined) data.status = input.status;
  if (input.accessCode !== undefined) data.accessCodeHash = await bcrypt.hash(input.accessCode, 10);

  const row = await tenantPrisma.posTerminal.update({ where: { id }, data });
  return publicTerminal(row);
}

export async function deactivateTerminal(tenantPrisma: PrismaClient, id: string) {
  const open = await tenantPrisma.posSession.findFirst({ where: { terminalId: id, status: "OPEN" } });
  if (open) {
    throw new AppError(409, "TERMINAL_HAS_OPEN_SESSION", "Close the open shift before deactivating this terminal");
  }
  return updateTerminal(tenantPrisma, id, { status: "INACTIVE" });
}

export async function listSessions(tenantPrisma: PrismaClient, query: SessionListFilters = {}) {
  const rows = await tenantPrisma.posSession.findMany({
    where: sessionListWhere(query),
    orderBy: { openedAt: "desc" },
    include: { terminal: true },
  });
  return rows.map((s) => ({ ...s, terminal: publicTerminal(s.terminal) }));
}

export async function openSession(
  tenantPrisma: PrismaClient,
  tenantId: string,
  input: { terminalId: string; openingCash: number; accessCode: string; cashierName: string },
  cashierId: string,
) {
  const terminal = await tenantPrisma.posTerminal.findUnique({ where: { id: input.terminalId } });
  if (!terminal) throw new AppError(404, "TERMINAL_NOT_FOUND", "POS terminal not found");
  if (terminal.status !== "ACTIVE") throw new AppError(409, "TERMINAL_INACTIVE", "This terminal is inactive");
  if (!terminal.accessCodeHash) {
    throw new AppError(409, "TERMINAL_ACCESS_CODE_REQUIRED", "Set an access code on this terminal before opening a shift");
  }
  const codeOk = await bcrypt.compare(input.accessCode, terminal.accessCodeHash);
  if (!codeOk) throw new AppError(403, "INVALID_ACCESS_CODE", "Incorrect access code for this terminal");

  const openAlready = await tenantPrisma.posSession.findFirst({
    where: { terminalId: input.terminalId, status: "OPEN" },
  });
  if (openAlready) {
    throw new AppError(409, "SESSION_ALREADY_OPEN", "This terminal already has an open session");
  }
  const session = await tenantPrisma.posSession.create({
    data: {
      tenantId,
      terminalId: input.terminalId,
      cashierId,
      cashierName: input.cashierName,
      openingCash: input.openingCash,
    },
    include: { terminal: true },
  });
  return { ...session, terminal: publicTerminal(session.terminal) };
}

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

export async function listDiscountRules(tenantPrisma: PrismaClient, tenantId: string) {
  const existing = await tenantPrisma.posDiscountRule.findMany({ orderBy: { name: "asc" } });
  if (existing.length > 0) return existing;

  const defaults = [
    { name: "5% off", type: "PERCENTAGE" as const, value: 5 },
    { name: "10% off", type: "PERCENTAGE" as const, value: 10 },
    { name: "AED 20 off", type: "FIXED" as const, value: 20 },
  ];
  for (const rule of defaults) {
    await tenantPrisma.posDiscountRule.create({ data: { tenantId, ...rule, active: true } });
  }
  return tenantPrisma.posDiscountRule.findMany({ orderBy: { name: "asc" } });
}

export function createDiscountRule(
  tenantPrisma: PrismaClient,
  tenantId: string,
  input: { name: string; type: "PERCENTAGE" | "FIXED"; value: number; active?: boolean },
) {
  if (input.type === "PERCENTAGE" && input.value > 100) {
    throw new AppError(400, "INVALID_DISCOUNT", "Percentage discount cannot exceed 100");
  }
  return tenantPrisma.posDiscountRule.create({ data: { tenantId, ...input } });
}

export async function updateDiscountRule(
  tenantPrisma: PrismaClient,
  id: string,
  input: { name?: string; value?: number; active?: boolean },
) {
  const existing = await tenantPrisma.posDiscountRule.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "DISCOUNT_RULE_NOT_FOUND", "Discount rule not found");
  if (existing.type === "PERCENTAGE" && input.value !== undefined && input.value > 100) {
    throw new AppError(400, "INVALID_DISCOUNT", "Percentage discount cannot exceed 100");
  }
  return tenantPrisma.posDiscountRule.update({ where: { id }, data: input });
}

export async function setManagerPin(
  tenantPrisma: PrismaClient,
  actor: Actor,
  input: { pin: string; currentPin?: string },
) {
  if (!(MANAGER_PIN_ROLES as readonly string[]).includes(actor.role)) {
    throw new AppError(403, "FORBIDDEN", "Only owner, admin, or manager can set a POS PIN");
  }
  const user = await tenantPrisma.user.findUnique({ where: { id: actor.id } });
  if (!user) throw new AppError(404, "USER_NOT_FOUND", "User not found");
  if (user.managerPinHash) {
    if (!input.currentPin || !(await bcrypt.compare(input.currentPin, user.managerPinHash))) {
      throw new AppError(403, "INVALID_MANAGER_PIN", "Current manager PIN is incorrect");
    }
  }
  return tenantPrisma.user.update({
    where: { id: actor.id },
    data: { managerPinHash: await hashManagerPin(input.pin) },
    select: { id: true, role: true, updatedAt: true },
  });
}

interface SaleItemInput {
  productId: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  discountRuleId?: string;
}

interface SalePaymentInput {
  paymentMethod: "CASH" | "CARD" | "BANK" | "MOBILE_PAYMENT" | "CHEQUE" | "OTHER";
  amount: number;
  tenderedAmount?: number;
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
  managerPin?: string;
}

async function generateTransactionNumber(db: Db, tenantId: string): Promise<string> {
  // Serialize POS number allocation for this tenant for the life of the surrounding transaction.
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`pos-txn-${tenantId}`}))`;
  const last = await db.sale.findFirst({
    where: { transactionNumber: { startsWith: "POS-" } },
    orderBy: { transactionNumber: "desc" },
    select: { transactionNumber: true },
  });
  let next = 1;
  if (last?.transactionNumber) {
    const match = last.transactionNumber.match(/(\d+)$/);
    if (match) next = Number(match[1]) + 1;
  }
  return `POS-${String(next).padStart(6, "0")}`;
}

export async function peekNextSaleNumber(tenantPrisma: PrismaClient): Promise<{ number: string }> {
  const last = await tenantPrisma.sale.findFirst({
    where: { transactionNumber: { startsWith: "POS-" } },
    orderBy: { transactionNumber: "desc" },
    select: { transactionNumber: true },
  });
  let next = 1;
  if (last?.transactionNumber) {
    const match = last.transactionNumber.match(/(\d+)$/);
    if (match) next = Number(match[1]) + 1;
  }
  return { number: `POS-${String(next).padStart(6, "0")}` };
}

export async function getSession(tenantPrisma: PrismaClient, id: string) {
  const session = await tenantPrisma.posSession.findUnique({
    where: { id },
    include: { terminal: true },
  });
  if (!session) throw new AppError(404, "SESSION_NOT_FOUND", "POS session not found");
  return { ...session, terminal: publicTerminal(session.terminal) };
}

export async function getOpenSessionForTerminal(tenantPrisma: PrismaClient, terminalId: string) {
  const session = await tenantPrisma.posSession.findFirst({
    where: { terminalId, status: "OPEN" },
    include: { terminal: true },
  });
  if (!session) throw new AppError(404, "NO_OPEN_SESSION", "No open session for this terminal");
  return { ...session, terminal: publicTerminal(session.terminal) };
}

async function currencyForSale(db: Db, invoiceId: string | null | undefined) {
  if (!invoiceId) return resolveCurrency();
  const invoice = await db.invoice.findUnique({ where: { id: invoiceId }, select: { currency: true } });
  return resolveCurrency(invoice?.currency);
}

async function resolveLine(
  db: Db,
  item: SaleItemInput,
  managerApproved: boolean,
): Promise<{
  productId: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  discountRuleId: string | null;
  tax: number;
  total: number;
  name: string;
}> {
  const product = await db.product.findUnique({ where: { id: item.productId } });
  if (!product) throw new AppError(404, "PRODUCT_NOT_FOUND", `Product ${item.productId} not found`);
  if (product.status !== "ACTIVE") {
    throw new AppError(409, "PRODUCT_INACTIVE", `${product.name} is not active`);
  }

  let discount = 0;
  let discountRuleId: string | null = null;
  if (item.discountRuleId) {
    const rule = await db.posDiscountRule.findUnique({ where: { id: item.discountRuleId } });
    if (!rule || !rule.active) throw new AppError(400, "INVALID_DISCOUNT_RULE", "Discount rule is missing or inactive");
    discount = discountFromRule(rule.type, Number(rule.value), item.quantity, item.unitPrice);
    discountRuleId = rule.id;
  } else if (item.discount > 0) {
    const lineGross = item.quantity * item.unitPrice;
    const softStandardCap = Math.max(roundMoney(lineGross * 0.1), 20);
    if (!managerApproved && item.discount > softStandardCap + 0.001) {
      throw new AppError(403, "DISCOUNT_REQUIRES_MANAGER", "Override discounts require a manager PIN");
    }
    discount = roundMoney(Math.min(item.discount, lineGross));
  }

  const tax = taxFromRate(item.quantity, item.unitPrice, discount, Number(product.taxRate));
  return {
    productId: item.productId,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    discount,
    discountRuleId,
    tax,
    total: lineTotal(item.quantity, item.unitPrice, discount, tax),
    name: product.name,
  };
}

async function ensureWalkInCustomer(db: Db, tenantId: string) {
  const existing = await db.customer.findFirst({ where: { customerCode: "WALK-IN" } });
  if (existing) return existing;
  return db.customer.create({
    data: { tenantId, customerCode: "WALK-IN", name: "Walk-in Customer", status: "ACTIVE" },
  });
}

async function createPosInvoiceAndFulfill(
  db: Db,
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
  payments: SalePaymentInput[],
  currency: string,
) {
  const customerId = sale.customerId ?? (await ensureWalkInCustomer(db, tenantId)).id;
  const products = await db.product.findMany({
    where: { id: { in: sale.items.map((i) => i.productId) } },
  });
  const nameById = new Map(products.map((p) => [p.id, p.name]));

  const invoice = await createInvoiceCore(db, tenantId, {
    customerId,
    dueDate: new Date(),
    source: "POS",
    currency,
    items: sale.items.map((item) => ({
      productId: item.productId,
      description: nameById.get(item.productId) ?? "POS item",
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
      discount: Number(item.discount),
      tax: Number(item.tax),
    })),
  });

  await db.invoice.update({
    where: { id: invoice.id },
    data: {
      status: "PAID",
      paidAmount: invoice.total,
      balanceDue: 0,
      sentAt: new Date(),
    },
  });

  for (const payment of payments) {
    await db.payment.create({
      data: {
        tenantId,
        amount: payment.amount,
        tenderedAmount: payment.tenderedAmount ?? payment.amount,
        currency,
        paymentMethod: payment.paymentMethod,
        paymentDate: new Date(),
        referenceType: "INVOICE",
        referenceId: invoice.id,
        transactionReference: sale.transactionNumber,
        createdBy: userId,
      },
    });
  }

  await autoFulfillPos(db, tenantId, invoice.id, warehouseId, userId, {
    skipStockMovement: true,
    pendingProductIds,
  });

  await db.sale.update({ where: { id: sale.id }, data: { invoiceId: invoice.id } });
  return invoice;
}

export async function createSale(
  tenantPrisma: PrismaClient,
  tenantId: string,
  input: CreateSaleInput,
  actor: Actor,
  currency = "AED",
) {
  if (input.isOfflineSync && input.deviceId && input.offlineTransactionKey) {
    const existing = await tenantPrisma.sale.findUnique({
      where: {
        deviceId_offlineTransactionKey: { deviceId: input.deviceId, offlineTransactionKey: input.offlineTransactionKey },
      },
      include: { items: true },
    });
    if (existing) return existing;
  }

  const needsOverride = input.items.some((item) => item.discount > 0 && !item.discountRuleId);
  const approvedBy = needsOverride ? await assertManagerApproval(tenantPrisma, input.managerPin, actor) : undefined;

  return tenantPrisma.$transaction(async (tx) => {
    const session = await tx.posSession.findUnique({ where: { id: input.posSessionId }, include: { terminal: true } });
    if (!session) throw new AppError(404, "SESSION_NOT_FOUND", "POS session not found");
    if (session.status !== "OPEN") throw new AppError(409, "SESSION_CLOSED", "This POS session is closed");

    const lines = [];
    for (const item of input.items) {
      lines.push(await resolveLine(tx, item, Boolean(approvedBy)));
    }

    const subtotal = roundMoney(lines.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0));
    const discount = roundMoney(lines.reduce((sum, i) => sum + i.discount, 0));
    const tax = roundMoney(lines.reduce((sum, i) => sum + i.tax, 0));
    const total = roundMoney(subtotal - discount + tax);

    const paid = roundMoney(input.payments.reduce((sum, p) => sum + p.amount, 0));
    if (Math.abs(paid - total) > 0.01) {
      throw new AppError(400, "PAYMENT_MISMATCH", `Payments total ${paid} do not match sale total ${total}`);
    }

    const transactionNumber = await generateTransactionNumber(tx, tenantId);
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
        approvedBy,
        items: {
          create: lines.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discount: item.discount,
            discountRuleId: item.discountRuleId,
            tax: item.tax,
            total: item.total,
          })),
        },
      },
      include: { items: true },
    });

    const pendingProductIds: string[] = [];
    const allowNegative = input.isOfflineSync;

    for (const item of lines) {
      const before = await tx.stockBalance.findUnique({
        where: {
          warehouseId_productId: {
            warehouseId: session.terminal.warehouseId,
            productId: item.productId,
          },
        },
      });
      const available = before ? Number(before.quantity) : 0;
      if (item.quantity > available) {
        if (!allowNegative) {
          throw new AppError(
            409,
            "INSUFFICIENT_STOCK",
            `Only ${available} available for ${item.name}, requested ${item.quantity}`,
          );
        }
        pendingProductIds.push(item.productId);
      }

      await issueStockCore(
        tx,
        tenantId,
        {
          productId: item.productId,
          warehouseId: session.terminal.warehouseId,
          quantity: item.quantity,
          movementType: "SALE",
          allowNegative,
          referenceType: "SALE",
          referenceId: saleRow.id,
        },
        actor.id,
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
          tenderedAmount: payment.tenderedAmount ?? payment.amount,
          currency,
          transactionReference: payment.transactionReference,
          createdBy: actor.id,
        },
      });
    }

    await emitAccountingEvent(tx, tenantId, {
      eventType: "SALE_COMPLETED",
      referenceType: "SALE",
      referenceId: saleRow.id,
      amount: total,
      taxAmount: tax,
      payload: { posSessionId: input.posSessionId, itemCount: lines.length },
    });

    await createPosInvoiceAndFulfill(
      tx,
      tenantId,
      saleRow,
      session.terminal.warehouseId,
      actor.id,
      pendingProductIds,
      input.payments,
      currency,
    );

    return tx.sale.findUniqueOrThrow({
      where: { id: saleRow.id },
      include: { items: true },
    });
  });
}

export async function listSales(tenantPrisma: PrismaClient, query: SaleListFilters = {}) {
  let matchingSessionIds: string[] | undefined;
  if (query.terminalId) {
    const sessions = await tenantPrisma.posSession.findMany({
      where: { terminalId: query.terminalId },
      select: { id: true },
    });
    matchingSessionIds = sessions.map((s) => s.id);
    if (matchingSessionIds.length === 0) return [];
  }
  const rows = await tenantPrisma.sale.findMany({
    where: saleListWhere({ ...query, matchingSessionIds }),
    orderBy: { createdAt: "desc" },
    include: { items: true, returns: { include: { items: true } } },
  });
  const sessionIds = [...new Set(rows.map((r) => r.posSessionId).filter((id): id is string => Boolean(id)))];
  const sessions = sessionIds.length
    ? await tenantPrisma.posSession.findMany({
        where: { id: { in: sessionIds } },
        select: { id: true, terminalId: true },
      })
    : [];
  const terminalBySession = new Map(sessions.map((s) => [s.id, s.terminalId]));
  return rows.map((row) => ({
    ...row,
    terminalId: row.posSessionId ? (terminalBySession.get(row.posSessionId) ?? null) : null,
  }));
}

export async function getSale(tenantPrisma: PrismaClient, id: string, tenantCurrency?: string | null) {
  const sale = await tenantPrisma.sale.findUnique({
    where: { id },
    include: {
      items: true,
      returns: { include: { items: true } },
      exchanges: { include: { items: true } },
      invoice: { select: { id: true, invoiceNumber: true, status: true, currency: true } },
    },
  });
  if (!sale) throw new AppError(404, "SALE_NOT_FOUND", "Sale not found");
  const payments = await tenantPrisma.payment.findMany({
    where: { referenceType: "SALE", referenceId: id },
    orderBy: { paymentDate: "asc" },
  });
  return {
    ...sale,
    payments: payments.map((payment) => ({
      ...payment,
      currency: resolveCurrency(payment.currency, sale.invoice?.currency, tenantCurrency),
    })),
  };
}

export async function getReceipt(tenantPrisma: PrismaClient, saleId: string, tenantCurrency?: string | null) {
  const sale = await getSale(tenantPrisma, saleId, tenantCurrency);
  const session = sale.posSessionId
    ? await tenantPrisma.posSession.findUnique({
        where: { id: sale.posSessionId },
        include: { terminal: true },
      })
    : null;
  const cashier = session
    ? await tenantPrisma.user.findUnique({ where: { id: session.cashierId }, select: { id: true, name: true } })
    : null;
  const customer = sale.customerId
    ? await tenantPrisma.customer.findUnique({
        where: { id: sale.customerId },
        select: { id: true, name: true, customerCode: true },
      })
    : { id: null, name: "Walk-in Customer", customerCode: "WALK-IN" };

  const openCashDrawer = sale.payments.some((p) => p.paymentMethod === "CASH");

  return {
    transactionNumber: sale.transactionNumber,
    transactionDate: sale.transactionDate,
    status: sale.status,
    terminal: session?.terminal ? { id: session.terminal.id, name: session.terminal.name, code: session.terminal.code } : null,
    cashier: cashier,
    customer,
    warehouseId: sale.warehouseId,
    items: sale.items,
    subtotal: sale.subtotal,
    discount: sale.discount,
    tax: sale.tax,
    total: sale.total,
    payments: sale.payments,
    invoice: sale.invoice,
    openCashDrawer,
    print: { protocol: "ESC/POS", paperWidthMm: 80, drawerKick: openCashDrawer },
  };
}

export async function lookupCatalogByBarcode(tenantPrisma: PrismaClient, barcode: string) {
  return lookupProductByBarcode(tenantPrisma, barcode);
}

async function remainingByProduct(
  db: Db,
  sale: { id: string; items: { productId: string; quantity: unknown }[] },
) {
  const returned = await db.saleReturnItem.findMany({ where: { saleReturn: { saleId: sale.id } } });
  const exchanged = await db.saleExchangeItem.findMany({
    where: { exchange: { saleId: sale.id }, direction: "RETURN" },
  });
  const used = new Map<string, number>();
  for (const r of returned) {
    used.set(r.productId, (used.get(r.productId) ?? 0) + Number(r.quantity));
  }
  for (const r of exchanged) {
    used.set(r.productId, (used.get(r.productId) ?? 0) + Number(r.quantity));
  }
  const remaining = new Map<string, number>();
  for (const line of sale.items) {
    remaining.set(line.productId, Number(line.quantity) - (used.get(line.productId) ?? 0));
  }
  return remaining;
}

function assertQtyAvailable(remaining: Map<string, number>, items: { productId: string; quantity: number }[]) {
  for (const item of items) {
    const left = remaining.get(item.productId) ?? 0;
    if (item.quantity > left + 1e-9) {
      throw new AppError(
        409,
        "RETURN_EXCEEDS_SALE",
        `Cannot return ${item.quantity} of product ${item.productId}; only ${left} remaining`,
      );
    }
  }
}

interface RefundItemInput {
  productId: string;
  quantity: number;
  unitPrice: number;
  condition: "SELLABLE" | "DAMAGED";
}

async function restockReturnItems(
  db: Db,
  tenantId: string,
  warehouseId: string,
  items: RefundItemInput[],
  referenceId: string,
  userId: string,
  referenceType: "SALE_RETURN" | "SALE_EXCHANGE",
) {
  for (const item of items) {
    if (item.condition === "SELLABLE") {
      const balance = await db.stockBalance.findUnique({
        where: { warehouseId_productId: { warehouseId, productId: item.productId } },
      });
      await receiveStockCore(
        db,
        tenantId,
        {
          productId: item.productId,
          warehouseId,
          quantity: item.quantity,
          unitCost: balance ? Number(balance.averageCost) : 0,
          movementType: "SALES_RETURN",
          referenceType,
          referenceId,
        },
        userId,
      );
    } else {
      await quarantineStockCore(
        db,
        tenantId,
        {
          productId: item.productId,
          warehouseId,
          quantity: item.quantity,
          referenceType,
          referenceId,
        },
        userId,
      );
    }
  }
}

export async function refundSale(
  tenantPrisma: PrismaClient,
  tenantId: string,
  saleId: string,
  items: RefundItemInput[],
  reason: string | undefined,
  actor: Actor,
  managerPin?: string,
) {
  const approvedBy = await assertManagerApproval(tenantPrisma, managerPin, actor);

  return tenantPrisma.$transaction(async (tx) => {
    const sale = await tx.sale.findUnique({ where: { id: saleId }, include: { items: true } });
    if (!sale) throw new AppError(404, "SALE_NOT_FOUND", "Sale not found");
    if (sale.status !== "COMPLETED" && sale.status !== "PARTIALLY_REFUNDED" && sale.status !== "EXCHANGED") {
      throw new AppError(409, "INVALID_SALE_STATE", `Sale is ${sale.status}, cannot refund`);
    }

    const remaining = await remainingByProduct(tx, sale);
    assertQtyAvailable(remaining, items);

    const refundAmount = roundMoney(
      items.reduce((sum, i) => {
        const saleLine = sale.items.find((l) => l.productId === i.productId);
        if (!saleLine) return sum;
        const qty = Number(saleLine.quantity);
        if (qty <= 0) return sum;
        // Proportional share of the original line total (includes tax)
        const unitShare = Number(saleLine.total) / qty;
        return sum + unitShare * i.quantity;
      }, 0),
    );

    const saleReturn = await tx.saleReturn.create({
      data: {
        tenantId,
        saleId,
        warehouseId: sale.warehouseId,
        refundAmount,
        reason,
        approvedBy,
        items: { create: items },
      },
      include: { items: true },
    });

    await restockReturnItems(tx, tenantId, sale.warehouseId, items, saleReturn.id, actor.id, "SALE_RETURN");

    const currency = await currencyForSale(tx, sale.invoiceId);
    await tx.payment.create({
      data: {
        tenantId,
        referenceType: "SALE",
        referenceId: saleId,
        paymentMethod: "CASH",
        amount: -refundAmount,
        currency,
        createdBy: actor.id,
      },
    });

    const remainingAfter = await remainingByProduct(tx, sale);
    const fullyReturned = [...remainingAfter.values()].every((qty) => qty <= 1e-9);

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

export async function voidSale(tenantPrisma: PrismaClient, tenantId: string, saleId: string, actor: Actor, managerPin?: string) {
  await assertManagerApproval(tenantPrisma, managerPin, actor);

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
    actor,
    managerPin,
  );

  const updated = await tenantPrisma.sale.update({ where: { id: saleId }, data: { status: "VOIDED" } });
  return { saleReturn, sale: updated };
}

export async function exchangeSale(
  tenantPrisma: PrismaClient,
  tenantId: string,
  saleId: string,
  input: {
    returns: RefundItemInput[];
    replacements: SaleItemInput[];
    payments: SalePaymentInput[];
    reason?: string;
    managerPin?: string;
  },
  actor: Actor,
) {
  const approvedBy = await assertManagerApproval(tenantPrisma, input.managerPin, actor);

  return tenantPrisma.$transaction(async (tx) => {
    const sale = await tx.sale.findUnique({ where: { id: saleId }, include: { items: true } });
    if (!sale) throw new AppError(404, "SALE_NOT_FOUND", "Sale not found");
    if (sale.status === "VOIDED" || sale.status === "REFUNDED") {
      throw new AppError(409, "INVALID_SALE_STATE", `Sale is ${sale.status}, cannot exchange`);
    }

    const remaining = await remainingByProduct(tx, sale);
    assertQtyAvailable(remaining, input.returns);

    const replacementLines = [];
    for (const item of input.replacements) {
      replacementLines.push(await resolveLine(tx, item, true));
    }

    const refundAmount = roundMoney(input.returns.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0));
    const replacementAmount = roundMoney(replacementLines.reduce((sum, i) => sum + i.total, 0));
    const netAmount = roundMoney(replacementAmount - refundAmount);

    if (netAmount > 0.01) {
      const paid = roundMoney(input.payments.reduce((sum, p) => sum + p.amount, 0));
      if (Math.abs(paid - netAmount) > 0.01) {
        throw new AppError(400, "PAYMENT_MISMATCH", `Payments total ${paid} do not match exchange due ${netAmount}`);
      }
    } else if (input.payments.length > 0) {
      throw new AppError(400, "PAYMENT_MISMATCH", "No additional payment is due on this exchange");
    }

    const exchange = await tx.saleExchange.create({
      data: {
        tenantId,
        saleId,
        warehouseId: sale.warehouseId,
        refundAmount,
        replacementAmount,
        netAmount,
        reason: input.reason,
        approvedBy,
        items: {
          create: [
            ...input.returns.map((item) => ({
              direction: "RETURN" as const,
              productId: item.productId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              condition: item.condition,
            })),
            ...replacementLines.map((item) => ({
              direction: "REPLACE" as const,
              productId: item.productId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              discount: item.discount,
              tax: item.tax,
            })),
          ],
        },
      },
      include: { items: true },
    });

    await restockReturnItems(tx, tenantId, sale.warehouseId, input.returns, exchange.id, actor.id, "SALE_EXCHANGE");

    for (const item of replacementLines) {
      await issueStockCore(
        tx,
        tenantId,
        {
          productId: item.productId,
          warehouseId: sale.warehouseId,
          quantity: item.quantity,
          movementType: "SALE",
          allowNegative: false,
          referenceType: "SALE_EXCHANGE",
          referenceId: exchange.id,
        },
        actor.id,
      );
    }

    if (netAmount > 0.01) {
      const currency = await currencyForSale(tx, sale.invoiceId);
      for (const payment of input.payments) {
        await tx.payment.create({
          data: {
            tenantId,
            referenceType: "SALE",
            referenceId: saleId,
            paymentMethod: payment.paymentMethod,
            amount: payment.amount,
            tenderedAmount: payment.tenderedAmount ?? payment.amount,
            currency,
            transactionReference: payment.transactionReference,
            createdBy: actor.id,
          },
        });
      }
    } else if (netAmount < -0.01) {
      await tx.payment.create({
        data: {
          tenantId,
          referenceType: "SALE",
          referenceId: saleId,
          paymentMethod: "CASH",
          amount: netAmount,
          currency: await currencyForSale(tx, sale.invoiceId),
          createdBy: actor.id,
        },
      });
    }

    const remainingAfter = await remainingByProduct(tx, sale);
    const fullyReturned = [...remainingAfter.values()].every((qty) => qty <= 1e-9);
    const updated = await tx.sale.update({
      where: { id: saleId },
      data: { status: fullyReturned ? "EXCHANGED" : sale.status },
    });

    await emitAccountingEvent(tx, tenantId, {
      eventType: "SALE_EXCHANGED",
      referenceType: "SALE",
      referenceId: saleId,
      amount: netAmount,
      payload: { saleExchangeId: exchange.id, refundAmount, replacementAmount },
    });

    return { exchange, sale: updated };
  });
}

function errorMessage(err: unknown): string {
  if (err instanceof AppError) return `${err.code}: ${err.message}`;
  if (err instanceof Error) return err.message;
  return String(err);
}

export async function recordSyncFailure(
  tenantPrisma: PrismaClient,
  tenantId: string,
  input: Record<string, unknown>,
  err: unknown,
) {
  const deviceId = typeof input.deviceId === "string" ? input.deviceId : undefined;
  const offlineTransactionKey =
    typeof input.offlineTransactionKey === "string" ? input.offlineTransactionKey : undefined;
  if (!deviceId || !offlineTransactionKey) return null;
  return tenantPrisma.posSyncFailure.upsert({
    where: {
      deviceId_offlineTransactionKey: { deviceId, offlineTransactionKey },
    },
    create: {
      tenantId,
      deviceId,
      offlineTransactionKey,
      payload: input as Prisma.InputJsonValue,
      lastError: errorMessage(err),
    },
    update: {
      lastError: errorMessage(err),
      attemptCount: { increment: 1 },
      status: "PENDING",
      payload: input as Prisma.InputJsonValue,
    },
  });
}

export function listSyncFailures(tenantPrisma: PrismaClient, status?: "PENDING" | "RESOLVED" | "DISCARDED") {
  return tenantPrisma.posSyncFailure.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: "desc" },
  });
}

export async function reportSyncFailure(
  tenantPrisma: PrismaClient,
  tenantId: string,
  input: { deviceId: string; offlineTransactionKey: string; payload: Record<string, unknown>; lastError: string },
) {
  return tenantPrisma.posSyncFailure.upsert({
    where: {
      deviceId_offlineTransactionKey: {
        deviceId: input.deviceId,
        offlineTransactionKey: input.offlineTransactionKey,
      },
    },
    create: {
      tenantId,
      deviceId: input.deviceId,
      offlineTransactionKey: input.offlineTransactionKey,
      payload: input.payload as Prisma.InputJsonValue,
      lastError: input.lastError,
    },
    update: {
      lastError: input.lastError,
      attemptCount: { increment: 1 },
      status: "PENDING",
      payload: input.payload as Prisma.InputJsonValue,
    },
  });
}

export async function retrySyncFailure(
  tenantPrisma: PrismaClient,
  tenantId: string,
  id: string,
  actor: Actor,
) {
  const row = await tenantPrisma.posSyncFailure.findUnique({ where: { id } });
  if (!row) throw new AppError(404, "SYNC_FAILURE_NOT_FOUND", "Sync failure not found");
  if (row.status !== "PENDING") throw new AppError(409, "NOT_PENDING", "Only pending failures can be retried");

  const payload = row.payload as unknown as CreateSaleInput;
  try {
    const sale = await createSale(
      tenantPrisma,
      tenantId,
      {
        ...payload,
        isOfflineSync: true,
        deviceId: row.deviceId,
        offlineTransactionKey: row.offlineTransactionKey,
      },
      actor,
    );
    await tenantPrisma.posSyncFailure.update({
      where: { id },
      data: { status: "RESOLVED", resolvedAt: new Date(), resolvedBy: actor.id },
    });
    return sale;
  } catch (err) {
    await recordSyncFailure(tenantPrisma, tenantId, { ...payload }, err);
    throw err;
  }
}

export async function resolveSyncFailure(
  tenantPrisma: PrismaClient,
  id: string,
  status: "RESOLVED" | "DISCARDED",
  actorId: string,
) {
  const row = await tenantPrisma.posSyncFailure.findUnique({ where: { id } });
  if (!row) throw new AppError(404, "SYNC_FAILURE_NOT_FOUND", "Sync failure not found");
  return tenantPrisma.posSyncFailure.update({
    where: { id },
    data: { status, resolvedAt: new Date(), resolvedBy: actorId },
  });
}
