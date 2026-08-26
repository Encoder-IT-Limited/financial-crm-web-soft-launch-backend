import type { PrismaClient, Prisma } from "../../generated/tenant-client/client";
import { AppError } from "../../utils/errors";
import { emitAccountingEvent } from "../accounting/accounting.service";
import { weightedAverageCost } from "./inventory.costing";
import { generateBatchNumber } from "./inventory.batch";
import type { ProductDto } from "./inventory.dto";
import type { z } from "zod";
import type { createProductSchema, updateProductSchema } from "./inventory.validation";

type Db = PrismaClient | Prisma.TransactionClient;

// --- Catalog -------------------------------------------------------------

const productInclude = {
  category: { select: { id: true, name: true } },
  unit: { select: { id: true, name: true, symbol: true } },
} as const;

function toProductDto(
  row: {
    id: string;
    sku: string;
    barcode: string | null;
    name: string;
    description: string | null;
    categoryId: string | null;
    unitId: string | null;
    costPrice: unknown;
    sellingPrice: unknown;
    taxRate: unknown;
    minimumStock: unknown;
    reorderLevel: unknown;
    trackBatch: boolean;
    status: string;
    createdAt: Date;
    category?: { name: string } | null;
    unit?: { name: string; symbol: string } | null;
    stockBalances?: { quantity: unknown; damagedQuantity?: unknown }[];
  },
): ProductDto {
  const onHand = (row.stockBalances ?? []).reduce((sum, b) => sum + Number(b.quantity), 0);
  const damagedOnHand = (row.stockBalances ?? []).reduce((sum, b) => sum + Number(b.damagedQuantity ?? 0), 0);
  return {
    id: row.id,
    sku: row.sku,
    barcode: row.barcode,
    name: row.name,
    description: row.description,
    categoryId: row.categoryId,
    categoryName: row.category?.name ?? null,
    unitId: row.unitId,
    unitName: row.unit?.name ?? null,
    unitSymbol: row.unit?.symbol ?? null,
    costPrice: Number(row.costPrice),
    sellingPrice: Number(row.sellingPrice),
    taxRate: Number(row.taxRate),
    minimumStock: Number(row.minimumStock),
    reorderLevel: Number(row.reorderLevel),
    trackBatch: row.trackBatch,
    status: row.status,
    onHand,
    damagedOnHand,
    createdAt: row.createdAt.toISOString(),
  };
}

export function listCategories(tenantPrisma: PrismaClient) {
  return tenantPrisma.productCategory.findMany({ orderBy: { name: "asc" } });
}

export function createCategory(
  tenantPrisma: PrismaClient,
  tenantId: string,
  input: { name: string; parentId?: string },
) {
  return tenantPrisma.productCategory.create({ data: { tenantId, ...input } });
}

export function listUnits(tenantPrisma: PrismaClient) {
  return tenantPrisma.unit.findMany({ orderBy: { name: "asc" } });
}

export function createUnit(tenantPrisma: PrismaClient, tenantId: string, input: { name: string; symbol: string }) {
  return tenantPrisma.unit.create({ data: { tenantId, ...input } });
}

export async function listProducts(tenantPrisma: PrismaClient, barcode?: string) {
  const rows = await tenantPrisma.product.findMany({
    where: barcode ? { barcode } : undefined,
    include: { ...productInclude, stockBalances: { select: { quantity: true, damagedQuantity: true } } },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toProductDto);
}

export async function lookupProductByBarcode(tenantPrisma: PrismaClient, barcode: string) {
  const rows = await tenantPrisma.product.findMany({
    where: { barcode },
    include: { ...productInclude, stockBalances: { select: { quantity: true, damagedQuantity: true } } },
    take: 2,
  });
  if (rows.length === 0) throw new AppError(404, "PRODUCT_NOT_FOUND", `No product with barcode ${barcode}`);
  if (rows.length > 1) {
    throw new AppError(409, "AMBIGUOUS_BARCODE", `Multiple products share barcode ${barcode}`);
  }
  return toProductDto(rows[0]);
}

export async function createProduct(
  tenantPrisma: PrismaClient,
  tenantId: string,
  input: z.infer<typeof createProductSchema>,
) {
  const row = await tenantPrisma.product.create({
    data: {
      tenantId,
      sku: input.sku,
      barcode: input.barcode,
      name: input.name,
      description: input.description,
      categoryId: input.categoryId,
      unitId: input.unitId,
      costPrice: input.costPrice,
      sellingPrice: input.sellingPrice,
      taxRate: input.taxRate,
      minimumStock: input.minimumStock,
      reorderLevel: input.reorderLevel,
      trackBatch: input.trackBatch,
      status: input.status,
    },
    include: { ...productInclude, stockBalances: { select: { quantity: true, damagedQuantity: true } } },
  });
  return toProductDto(row);
}

export async function updateProduct(
  tenantPrisma: PrismaClient,
  id: string,
  input: z.infer<typeof updateProductSchema>,
) {
  const existing = await tenantPrisma.product.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "PRODUCT_NOT_FOUND", "Product not found");

  const row = await tenantPrisma.product.update({
    where: { id },
    data: {
      ...(input.sku !== undefined ? { sku: input.sku } : {}),
      ...(input.barcode !== undefined ? { barcode: input.barcode } : {}),
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
      ...(input.unitId !== undefined ? { unitId: input.unitId } : {}),
      ...(input.costPrice !== undefined ? { costPrice: input.costPrice } : {}),
      ...(input.sellingPrice !== undefined ? { sellingPrice: input.sellingPrice } : {}),
      ...(input.taxRate !== undefined ? { taxRate: input.taxRate } : {}),
      ...(input.minimumStock !== undefined ? { minimumStock: input.minimumStock } : {}),
      ...(input.reorderLevel !== undefined ? { reorderLevel: input.reorderLevel } : {}),
      ...(input.trackBatch !== undefined ? { trackBatch: input.trackBatch } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    },
    include: { ...productInclude, stockBalances: { select: { quantity: true, damagedQuantity: true } } },
  });
  return toProductDto(row);
}

export function listWarehouses(tenantPrisma: PrismaClient) {
  return tenantPrisma.warehouse.findMany({ orderBy: { name: "asc" } });
}

export function createWarehouse(
  tenantPrisma: PrismaClient,
  tenantId: string,
  input: { name: string; code: string; address?: string; status?: "ACTIVE" | "INACTIVE" },
) {
  return tenantPrisma.warehouse.create({
    data: {
      tenantId,
      name: input.name,
      code: input.code,
      address: input.address,
      status: input.status ?? "ACTIVE",
    },
  });
}

// --- Stock movement core (transaction-agnostic — callers decide the
// transaction boundary, so these compose inside larger workflows like stock
// transfers without nesting $transaction calls) ---------------------------

export interface ReceiveStockInput {
  productId: string;
  warehouseId: string;
  quantity: number;
  unitCost: number;
  batchNumber?: string;
  expiryDate?: Date;
  manufactureDate?: Date;
  movementType: "PURCHASE_RECEIPT" | "OPENING" | "SALES_RETURN" | "TRANSFER_IN";
  referenceType?: string;
  referenceId?: string;
}

async function upsertStockBalance(
  db: Db,
  tenantId: string,
  warehouseId: string,
  productId: string,
  newQuantity: number,
  newAverageCost: number,
) {
  return db.stockBalance.upsert({
    where: { warehouseId_productId: { warehouseId, productId } },
    create: { tenantId, warehouseId, productId, quantity: newQuantity, averageCost: newAverageCost },
    update: { quantity: newQuantity, averageCost: newAverageCost },
  });
}

// Weighted Average Cost, per docs/requirements-qa.md — receipts move the
// average cost, issues and adjustments never do.
export async function receiveStockCore(db: Db, tenantId: string, input: ReceiveStockInput, userId: string) {
  const product = await db.product.findUnique({ where: { id: input.productId } });
  if (!product) throw new AppError(404, "PRODUCT_NOT_FOUND", "Product not found");

  const existing = await db.stockBalance.findUnique({
    where: { warehouseId_productId: { warehouseId: input.warehouseId, productId: input.productId } },
  });
  const existingQty = existing ? Number(existing.quantity) : 0;
  const existingCost = existing ? Number(existing.averageCost) : 0;
  const { newQty, newAvgCost } = weightedAverageCost(existingQty, existingCost, input.quantity, input.unitCost);

  const balance = await upsertStockBalance(
    db,
    tenantId,
    input.warehouseId,
    input.productId,
    newQty,
    newAvgCost,
  );

  let batch = null;
  const batchNumber = input.batchNumber?.trim() || generateBatchNumber();
  const existingBatch = await db.batch.findFirst({
    where: { productId: input.productId, warehouseId: input.warehouseId, batchNumber },
  });
  if (existingBatch) {
    batch = await db.batch.update({
      where: { id: existingBatch.id },
      data: {
        quantity: { increment: input.quantity },
        expiryDate: input.expiryDate ?? existingBatch.expiryDate,
        manufactureDate: input.manufactureDate ?? existingBatch.manufactureDate,
      },
    });
  } else {
    batch = await db.batch.create({
      data: {
        productId: input.productId,
        warehouseId: input.warehouseId,
        batchNumber,
        expiryDate: input.expiryDate,
        manufactureDate: input.manufactureDate,
        quantity: input.quantity,
      },
    });
  }

  const movement = await db.stockMovement.create({
    data: {
      tenantId,
      warehouseId: input.warehouseId,
      productId: input.productId,
      batchId: batch?.id,
      movementType: input.movementType,
      quantity: input.quantity,
      unitCost: input.unitCost,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      createdBy: userId,
    },
  });

  await emitAccountingEvent(db, tenantId, {
    eventType: "STOCK_RECEIVED",
    referenceType: input.referenceType ?? "STOCK_MOVEMENT",
    referenceId: movement.id,
    amount: input.quantity * input.unitCost,
    payload: { productId: input.productId, warehouseId: input.warehouseId, quantity: input.quantity, unitCost: input.unitCost, movementType: input.movementType },
  });

  return { balance, batch, movement };
}

export async function receiveStock(
  tenantPrisma: PrismaClient,
  tenantId: string,
  input: ReceiveStockInput,
  userId: string,
) {
  return tenantPrisma.$transaction((tx) => receiveStockCore(tx, tenantId, input, userId));
}

export interface IssueStockInput {
  productId: string;
  warehouseId: string;
  quantity: number;
  movementType: "SALE" | "PURCHASE_RETURN" | "DAMAGE" | "EXPIRY" | "MANUAL_ISSUE" | "TRANSFER_OUT";
  allowNegative: boolean;
  referenceType?: string;
  referenceId?: string;
}

// Batch selection is FEFO (earliest expiry first) falling back to FIFO for
// undated batches, per docs/requirements-qa.md. Valuation stays Weighted
// Average regardless of which physical batch is drawn down — cost recorded
// on every movement is the balance's current average cost, not the batch's
// own receipt cost.
export async function issueStockCore(db: Db, tenantId: string, input: IssueStockInput, userId: string) {
  const product = await db.product.findUnique({ where: { id: input.productId } });
  if (!product) throw new AppError(404, "PRODUCT_NOT_FOUND", "Product not found");

  const balance = await db.stockBalance.findUnique({
    where: { warehouseId_productId: { warehouseId: input.warehouseId, productId: input.productId } },
  });
  const available = balance ? Number(balance.quantity) : 0;

  if (input.quantity > available && !input.allowNegative) {
    throw new AppError(
      409,
      "INSUFFICIENT_STOCK",
      `Only ${available} available for this product/warehouse, requested ${input.quantity}`,
    );
  }

  const unitCost = balance ? Number(balance.averageCost) : 0;
  await upsertStockBalance(
    db,
    tenantId,
    input.warehouseId,
    input.productId,
    available - input.quantity,
    unitCost,
  );

  let remaining = input.quantity;
  const movements: Awaited<ReturnType<typeof db.stockMovement.create>>[] = [];

  if (product.trackBatch) {
    const batches = await db.batch.findMany({
      where: { productId: input.productId, warehouseId: input.warehouseId, quantity: { gt: 0 } },
      orderBy: [{ expiryDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    });

    for (const batch of batches) {
      if (remaining <= 0) break;
      const take = Math.min(Number(batch.quantity), remaining);
      if (take <= 0) continue;

      await db.batch.update({ where: { id: batch.id }, data: { quantity: { decrement: take } } });

      movements.push(
        await db.stockMovement.create({
          data: {
            tenantId,
            warehouseId: input.warehouseId,
            productId: input.productId,
            batchId: batch.id,
            movementType: input.movementType,
            quantity: -take,
            unitCost,
            referenceType: input.referenceType,
            referenceId: input.referenceId,
            createdBy: userId,
          },
        }),
      );
      remaining -= take;
    }
  }

  if (remaining > 0) {
    // Either this product doesn't track batches, or tracked batches were
    // insufficient and allowNegative permitted the shortfall — recorded
    // unbatched.
    movements.push(
      await db.stockMovement.create({
        data: {
          tenantId,
          warehouseId: input.warehouseId,
          productId: input.productId,
          batchId: null,
          movementType: input.movementType,
          quantity: -remaining,
          unitCost,
          referenceType: input.referenceType,
          referenceId: input.referenceId,
          createdBy: userId,
        },
      }),
    );
  }

  await emitAccountingEvent(db, tenantId, {
    eventType: "STOCK_ISSUED",
    referenceType: input.referenceType ?? "STOCK_MOVEMENT",
    referenceId: movements[0]?.id ?? input.productId,
    amount: input.quantity * unitCost,
    payload: { productId: input.productId, warehouseId: input.warehouseId, quantity: input.quantity, unitCost, movementType: input.movementType },
  });

  return { movements };
}

export async function issueStock(
  tenantPrisma: PrismaClient,
  tenantId: string,
  input: IssueStockInput,
  userId: string,
) {
  return tenantPrisma.$transaction((tx) => issueStockCore(tx, tenantId, input, userId));
}

export async function quarantineStockCore(
  db: Db,
  tenantId: string,
  input: { productId: string; warehouseId: string; quantity: number; referenceType?: string; referenceId?: string },
  userId: string,
) {
  const existing = await db.stockBalance.findUnique({
    where: { warehouseId_productId: { warehouseId: input.warehouseId, productId: input.productId } },
  });
  const sellable = existing ? Number(existing.quantity) : 0;
  const damaged = existing ? Number(existing.damagedQuantity) : 0;
  const averageCost = existing ? Number(existing.averageCost) : 0;

  await upsertStockBalance(db, tenantId, input.warehouseId, input.productId, sellable, averageCost);
  await db.stockBalance.update({
    where: { warehouseId_productId: { warehouseId: input.warehouseId, productId: input.productId } },
    data: { damagedQuantity: damaged + input.quantity },
  });

  const movement = await db.stockMovement.create({
    data: {
      tenantId,
      warehouseId: input.warehouseId,
      productId: input.productId,
      movementType: "QUARANTINE",
      quantity: input.quantity,
      unitCost: averageCost,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      createdBy: userId,
    },
  });

  await emitAccountingEvent(db, tenantId, {
    eventType: "STOCK_QUARANTINED",
    referenceType: input.referenceType ?? "STOCK_MOVEMENT",
    referenceId: movement.id,
    amount: input.quantity * averageCost,
    payload: { productId: input.productId, warehouseId: input.warehouseId, quantity: input.quantity },
  });

  return movement;
}

export async function writeOffDamaged(
  tenantPrisma: PrismaClient,
  tenantId: string,
  input: { productId: string; warehouseId: string; quantity: number; referenceType?: string; referenceId?: string },
  userId: string,
) {
  return tenantPrisma.$transaction(async (tx) => {
    const balance = await tx.stockBalance.findUnique({
      where: { warehouseId_productId: { warehouseId: input.warehouseId, productId: input.productId } },
    });
    const damaged = balance ? Number(balance.damagedQuantity) : 0;
    if (input.quantity > damaged) {
      throw new AppError(
        409,
        "INSUFFICIENT_DAMAGED_STOCK",
        `Only ${damaged} damaged units available to write off, requested ${input.quantity}`,
      );
    }
    const unitCost = balance ? Number(balance.averageCost) : 0;
    await tx.stockBalance.update({
      where: { warehouseId_productId: { warehouseId: input.warehouseId, productId: input.productId } },
      data: { damagedQuantity: damaged - input.quantity },
    });
    const movement = await tx.stockMovement.create({
      data: {
        tenantId,
        warehouseId: input.warehouseId,
        productId: input.productId,
        movementType: "DAMAGE",
        quantity: -input.quantity,
        unitCost,
        referenceType: input.referenceType ?? "DAMAGED_WRITE_OFF",
        referenceId: input.referenceId,
        createdBy: userId,
      },
    });
    await emitAccountingEvent(tx, tenantId, {
      eventType: "STOCK_WRITTEN_OFF",
      referenceType: input.referenceType ?? "STOCK_MOVEMENT",
      referenceId: movement.id,
      amount: input.quantity * unitCost,
      payload: { productId: input.productId, warehouseId: input.warehouseId, quantity: input.quantity },
    });
    return movement;
  });
}

interface AdjustStockInput {
  productId: string;
  warehouseId: string;
  quantityDelta: number;
  referenceType?: string;
  referenceId?: string;
}

// Gated at the route level to OWNER/MANAGER only, per docs/requirements-qa.md
// ("Inventory Adjustments... require approval: Owner/Manager"). A full
// approval-request workflow (see system-workflows.md §16) is deferred —
// role-gating the direct action is the Phase 1 stand-in for "requires
// approval."
export async function adjustStock(
  tenantPrisma: PrismaClient,
  tenantId: string,
  input: AdjustStockInput,
  userId: string,
) {
  return tenantPrisma.$transaction(async (tx) => {
    const balance = await tx.stockBalance.findUnique({
      where: { warehouseId_productId: { warehouseId: input.warehouseId, productId: input.productId } },
    });
    const currentQty = balance ? Number(balance.quantity) : 0;
    const currentCost = balance ? Number(balance.averageCost) : 0;
    const newQty = currentQty + input.quantityDelta;

    const updated = await upsertStockBalance(
      tx,
      tenantId,
      input.warehouseId,
      input.productId,
      newQty,
      currentCost,
    );

    const movement = await tx.stockMovement.create({
      data: {
        tenantId,
        warehouseId: input.warehouseId,
        productId: input.productId,
        movementType: "ADJUSTMENT",
        quantity: input.quantityDelta,
        unitCost: currentCost,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        createdBy: userId,
      },
    });

    return { balance: updated, movement };
  });
}

// --- Stock transfers: Request → Approve → Dispatch → Receive -------------

interface TransferItemInput {
  productId: string;
  quantity: number;
}

export function requestTransfer(
  tenantPrisma: PrismaClient,
  tenantId: string,
  input: { fromWarehouseId: string; toWarehouseId: string; items: TransferItemInput[] },
  requestedBy: string,
) {
  return tenantPrisma.stockTransfer.create({
    data: {
      tenantId,
      fromWarehouseId: input.fromWarehouseId,
      toWarehouseId: input.toWarehouseId,
      requestedBy,
      status: "PENDING",
      items: { create: input.items },
    },
    include: { items: true },
  });
}

async function getTransferOrThrow(db: Db, transferId: string) {
  const transfer = await db.stockTransfer.findUnique({ where: { id: transferId }, include: { items: true } });
  if (!transfer) throw new AppError(404, "TRANSFER_NOT_FOUND", "Stock transfer not found");
  return transfer;
}

// Gated at the route level to OWNER/MANAGER, per docs/requirements-qa.md.
export async function approveTransfer(tenantPrisma: PrismaClient, transferId: string, approvedBy: string) {
  const transfer = await getTransferOrThrow(tenantPrisma, transferId);
  if (transfer.status !== "PENDING") {
    throw new AppError(409, "INVALID_TRANSFER_STATE", `Transfer is ${transfer.status}, expected PENDING`);
  }
  return tenantPrisma.stockTransfer.update({ where: { id: transferId }, data: { status: "APPROVED", approvedBy } });
}

export async function dispatchTransfer(tenantPrisma: PrismaClient, tenantId: string, transferId: string, userId: string) {
  return tenantPrisma.$transaction(async (tx) => {
    const transfer = await getTransferOrThrow(tx, transferId);
    if (transfer.status !== "APPROVED") {
      throw new AppError(409, "INVALID_TRANSFER_STATE", `Transfer is ${transfer.status}, expected APPROVED`);
    }

    for (const item of transfer.items) {
      const sourceBalance = await tx.stockBalance.findUnique({
        where: { warehouseId_productId: { warehouseId: transfer.fromWarehouseId, productId: item.productId } },
      });
      const unitCost = sourceBalance ? Number(sourceBalance.averageCost) : 0;

      await issueStockCore(
        tx,
        tenantId,
        {
          productId: item.productId,
          warehouseId: transfer.fromWarehouseId,
          quantity: Number(item.quantity),
          movementType: "TRANSFER_OUT",
          allowNegative: false,
          referenceType: "STOCK_TRANSFER",
          referenceId: transfer.id,
        },
        userId,
      );

      await tx.stockTransferItem.update({ where: { id: item.id }, data: { unitCost } });
    }

    return tx.stockTransfer.update({
      where: { id: transferId },
      data: { status: "DISPATCHED", dispatchedAt: new Date() },
    });
  });
}

export async function receiveTransfer(tenantPrisma: PrismaClient, tenantId: string, transferId: string, userId: string) {
  return tenantPrisma.$transaction(async (tx) => {
    const transfer = await getTransferOrThrow(tx, transferId);
    if (transfer.status !== "DISPATCHED") {
      throw new AppError(409, "INVALID_TRANSFER_STATE", `Transfer is ${transfer.status}, expected DISPATCHED`);
    }

    for (const item of transfer.items) {
      await receiveStockCore(
        tx,
        tenantId,
        {
          productId: item.productId,
          warehouseId: transfer.toWarehouseId,
          quantity: Number(item.quantity),
          unitCost: Number(item.unitCost),
          movementType: "TRANSFER_IN",
          referenceType: "STOCK_TRANSFER",
          referenceId: transfer.id,
        },
        userId,
      );
    }

    return tx.stockTransfer.update({
      where: { id: transferId },
      data: { status: "RECEIVED", receivedAt: new Date() },
    });
  });
}

export async function getProduct(tenantPrisma: PrismaClient, id: string) {
  const row = await tenantPrisma.product.findUnique({
    where: { id },
    include: { ...productInclude, stockBalances: { select: { quantity: true, damagedQuantity: true } } },
  });
  return row ? toProductDto(row) : null;
}

export function getWarehouse(tenantPrisma: PrismaClient, id: string) {
  return tenantPrisma.warehouse.findUnique({ where: { id } });
}

export function listStockBalances(tenantPrisma: PrismaClient) {
  return tenantPrisma.stockBalance.findMany({ orderBy: { productId: "asc" } });
}

export function listTransfers(tenantPrisma: PrismaClient) {
  return tenantPrisma.stockTransfer.findMany({ include: { items: true }, orderBy: { createdAt: "desc" } });
}

export function listMovements(tenantPrisma: PrismaClient) {
  return tenantPrisma.stockMovement.findMany({ orderBy: { movementDate: "desc" }, take: 200 });
}

export function listBatches(tenantPrisma: PrismaClient) {
  return tenantPrisma.batch.findMany({
    orderBy: [{ expiryDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
    take: 500,
  });
}
