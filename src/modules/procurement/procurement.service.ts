import type { PrismaClient, Prisma } from "../../generated/tenant-client/client";
import { AppError } from "../../common/errors";
import { emitAccountingEvent } from "../accounting/accounting.service";
import { receiveStockCore } from "../inventory/inventory.service";

type Db = PrismaClient | Prisma.TransactionClient;

// --- Suppliers ---------------------------------------------------------

export function listSuppliers(tenantPrisma: PrismaClient) {
  return tenantPrisma.supplier.findMany({ orderBy: { name: "asc" } });
}

export function createSupplier(
  tenantPrisma: PrismaClient,
  tenantId: string,
  input: { supplierCode: string; name: string; email?: string; phone?: string; address?: string; taxNumber?: string; openingBalance: number },
) {
  return tenantPrisma.supplier.create({ data: { tenantId, ...input } });
}

// --- Purchase orders -----------------------------------------------------
// Workflow: Requisition → Approval → Purchase Order → Goods Receipt →
// Purchase Invoice → Payment (docs/system-workflows.md §6). Requisition step
// is skipped for v1 — PO creation starts the tracked flow.

interface POItemInput {
  productId: string;
  quantity: number;
  unitCost: number;
  tax: number;
  discount: number;
}

async function generatePoNumber(tenantPrisma: PrismaClient): Promise<string> {
  const count = await tenantPrisma.purchaseOrder.count();
  return `PO-${String(count + 1).padStart(6, "0")}`;
}

export async function createPurchaseOrder(
  tenantPrisma: PrismaClient,
  tenantId: string,
  input: { supplierId: string; warehouseId: string; expectedDate?: Date; items: POItemInput[] },
) {
  const subtotal = input.items.reduce((sum, i) => sum + i.quantity * i.unitCost, 0);
  const tax = input.items.reduce((sum, i) => sum + i.tax, 0);
  const discount = input.items.reduce((sum, i) => sum + i.discount, 0);
  const poNumber = await generatePoNumber(tenantPrisma);

  return tenantPrisma.purchaseOrder.create({
    data: {
      tenantId,
      supplierId: input.supplierId,
      warehouseId: input.warehouseId,
      poNumber,
      expectedDate: input.expectedDate,
      subtotal,
      tax,
      discount,
      total: subtotal - discount + tax,
      status: "DRAFT",
      items: {
        create: input.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          unitCost: item.unitCost,
          tax: item.tax,
          discount: item.discount,
          total: item.quantity * item.unitCost - item.discount + item.tax,
        })),
      },
    },
    include: { items: true },
  });
}

export function listPurchaseOrders(tenantPrisma: PrismaClient) {
  return tenantPrisma.purchaseOrder.findMany({ orderBy: { createdAt: "desc" } });
}

export async function getPurchaseOrder(tenantPrisma: PrismaClient, id: string) {
  const po = await tenantPrisma.purchaseOrder.findUnique({ where: { id }, include: { items: true } });
  if (!po) throw new AppError(404, "PURCHASE_ORDER_NOT_FOUND", "Purchase order not found");
  return po;
}

export async function submitPurchaseOrder(tenantPrisma: PrismaClient, id: string) {
  const po = await tenantPrisma.purchaseOrder.findUnique({ where: { id } });
  if (!po) throw new AppError(404, "PURCHASE_ORDER_NOT_FOUND", "Purchase order not found");
  if (po.status !== "DRAFT") {
    throw new AppError(409, "INVALID_PO_STATE", `Purchase order is ${po.status}, expected DRAFT`);
  }
  return tenantPrisma.purchaseOrder.update({ where: { id }, data: { status: "PENDING_APPROVAL" } });
}

// Gated at the route level to OWNER/MANAGER, per docs/requirements-qa.md
// ("Will Purchase Orders require approval? Yes, Owner/Manager").
export async function approvePurchaseOrder(tenantPrisma: PrismaClient, id: string, approvedBy: string) {
  const po = await tenantPrisma.purchaseOrder.findUnique({ where: { id } });
  if (!po) throw new AppError(404, "PURCHASE_ORDER_NOT_FOUND", "Purchase order not found");
  if (po.status !== "PENDING_APPROVAL") {
    throw new AppError(409, "INVALID_PO_STATE", `Purchase order is ${po.status}, expected PENDING_APPROVAL`);
  }
  return tenantPrisma.purchaseOrder.update({ where: { id }, data: { status: "APPROVED", approvedBy } });
}

export async function rejectPurchaseOrder(tenantPrisma: PrismaClient, id: string) {
  const po = await tenantPrisma.purchaseOrder.findUnique({ where: { id } });
  if (!po) throw new AppError(404, "PURCHASE_ORDER_NOT_FOUND", "Purchase order not found");
  if (po.status !== "PENDING_APPROVAL") {
    throw new AppError(409, "INVALID_PO_STATE", `Purchase order is ${po.status}, expected PENDING_APPROVAL`);
  }
  return tenantPrisma.purchaseOrder.update({ where: { id }, data: { status: "REJECTED" } });
}

export async function closePurchaseOrder(tenantPrisma: PrismaClient, id: string) {
  const po = await tenantPrisma.purchaseOrder.findUnique({ where: { id } });
  if (!po) throw new AppError(404, "PURCHASE_ORDER_NOT_FOUND", "Purchase order not found");
  if (po.status !== "APPROVED") {
    throw new AppError(409, "INVALID_PO_STATE", `Purchase order is ${po.status}, expected APPROVED`);
  }
  return tenantPrisma.purchaseOrder.update({ where: { id }, data: { status: "CLOSED" } });
}

// --- Goods receipts (supports partial receipt; PO stays APPROVED/"open"
// until fully received or manually closed — docs/requirements-qa.md) -------

interface GoodsReceiptItemInput {
  productId: string;
  quantity: number;
  batchNumber?: string;
  expiryDate?: Date;
}

async function generateReceiptNumber(db: Db): Promise<string> {
  const count = await db.goodsReceipt.count();
  return `GR-${String(count + 1).padStart(6, "0")}`;
}

export async function createGoodsReceipt(
  tenantPrisma: PrismaClient,
  tenantId: string,
  purchaseOrderId: string,
  items: GoodsReceiptItemInput[],
  userId: string,
) {
  return tenantPrisma.$transaction(async (tx) => {
    const po = await tx.purchaseOrder.findUnique({ where: { id: purchaseOrderId }, include: { items: true } });
    if (!po) throw new AppError(404, "PURCHASE_ORDER_NOT_FOUND", "Purchase order not found");
    if (po.status !== "APPROVED") {
      throw new AppError(409, "INVALID_PO_STATE", `Purchase order is ${po.status}, expected APPROVED`);
    }

    const receiptNumber = await generateReceiptNumber(tx);
    const receipt = await tx.goodsReceipt.create({
      data: { tenantId, purchaseOrderId, warehouseId: po.warehouseId, receiptNumber },
    });

    for (const item of items) {
      const poLine = po.items.find((l) => l.productId === item.productId);
      if (!poLine) {
        throw new AppError(400, "VALIDATION_ERROR", `Product ${item.productId} is not on this purchase order`);
      }
      const remaining = Number(poLine.quantity) - Number(poLine.receivedQuantity);
      if (item.quantity > remaining) {
        throw new AppError(
          409,
          "OVER_RECEIPT",
          `Only ${remaining} remaining to receive for product ${item.productId}, requested ${item.quantity}`,
        );
      }

      const { batch } = await receiveStockCore(
        tx,
        tenantId,
        {
          productId: item.productId,
          warehouseId: po.warehouseId,
          quantity: item.quantity,
          unitCost: Number(poLine.unitCost),
          batchNumber: item.batchNumber,
          expiryDate: item.expiryDate,
          movementType: "PURCHASE_RECEIPT",
          referenceType: "GOODS_RECEIPT",
          referenceId: receipt.id,
        },
        userId,
      );

      await tx.goodsReceiptItem.create({
        data: {
          goodsReceiptId: receipt.id,
          productId: item.productId,
          quantity: item.quantity,
          batchId: batch?.id,
          unitCost: poLine.unitCost,
        },
      });

      await tx.purchaseOrderItem.update({
        where: { id: poLine.id },
        data: { receivedQuantity: { increment: item.quantity } },
      });
    }

    const refreshedItems = await tx.purchaseOrderItem.findMany({ where: { purchaseOrderId } });
    const fullyReceived = refreshedItems.every((l) => Number(l.receivedQuantity) >= Number(l.quantity));
    if (fullyReceived) {
      await tx.purchaseOrder.update({ where: { id: purchaseOrderId }, data: { status: "CLOSED" } });
    }

    return tx.goodsReceipt.findUnique({ where: { id: receipt.id }, include: { items: true } });
  });
}

export function listGoodsReceipts(tenantPrisma: PrismaClient, purchaseOrderId?: string) {
  return tenantPrisma.goodsReceipt.findMany({
    where: purchaseOrderId ? { purchaseOrderId } : undefined,
    orderBy: { createdAt: "desc" },
  });
}

// --- Purchase invoices (vendor bills — financial only) --------------------

async function generatePurchaseInvoiceNumber(tenantPrisma: PrismaClient): Promise<string> {
  const count = await tenantPrisma.purchaseInvoice.count();
  return `PBILL-${String(count + 1).padStart(6, "0")}`;
}

export async function createPurchaseInvoice(
  tenantPrisma: PrismaClient,
  tenantId: string,
  input: { supplierId: string; purchaseOrderId?: string; dueDate: Date; subtotal: number; tax: number; discount: number },
) {
  const total = input.subtotal - input.discount + input.tax;
  const invoiceNumber = await generatePurchaseInvoiceNumber(tenantPrisma);

  const invoice = await tenantPrisma.purchaseInvoice.create({
    data: { tenantId, ...input, invoiceNumber, total, balanceDue: total, status: "UNPAID" },
  });

  await emitAccountingEvent(tenantPrisma, tenantId, {
    eventType: "PURCHASE_INVOICE_RECORDED",
    referenceType: "PURCHASE_INVOICE",
    referenceId: invoice.id,
    amount: total,
    taxAmount: input.tax,
    payload: { supplierId: input.supplierId, purchaseOrderId: input.purchaseOrderId },
  });

  return invoice;
}

export function listPurchaseInvoices(tenantPrisma: PrismaClient) {
  return tenantPrisma.purchaseInvoice.findMany({ orderBy: { createdAt: "desc" } });
}

interface SupplierPaymentInput {
  amount: number;
  paymentMethod: "CASH" | "CARD" | "BANK" | "MOBILE_PAYMENT" | "CHEQUE" | "OTHER";
  transactionReference?: string;
}

export async function recordSupplierPayment(
  tenantPrisma: PrismaClient,
  tenantId: string,
  purchaseInvoiceId: string,
  input: SupplierPaymentInput,
  userId: string,
) {
  return tenantPrisma.$transaction(async (tx) => {
    const invoice = await tx.purchaseInvoice.findUnique({ where: { id: purchaseInvoiceId } });
    if (!invoice) throw new AppError(404, "PURCHASE_INVOICE_NOT_FOUND", "Purchase invoice not found");

    const payment = await tx.payment.create({
      data: {
        tenantId,
        referenceType: "PURCHASE_INVOICE",
        referenceId: purchaseInvoiceId,
        paymentMethod: input.paymentMethod,
        amount: input.amount,
        transactionReference: input.transactionReference,
        createdBy: userId,
      },
    });

    const paidAmount = Number(invoice.paidAmount) + input.amount;
    const balanceDue = Math.max(0, Number(invoice.total) - paidAmount);
    const status = balanceDue <= 0 ? "PAID" : "PARTIALLY_PAID";

    const updated = await tx.purchaseInvoice.update({
      where: { id: purchaseInvoiceId },
      data: { paidAmount, balanceDue, status },
    });

    await emitAccountingEvent(tx, tenantId, {
      eventType: "SUPPLIER_PAYMENT_MADE",
      referenceType: "PURCHASE_INVOICE",
      referenceId: purchaseInvoiceId,
      amount: input.amount,
      payload: { paymentId: payment.id, paymentMethod: input.paymentMethod },
    });

    return { payment, invoice: updated };
  });
}
