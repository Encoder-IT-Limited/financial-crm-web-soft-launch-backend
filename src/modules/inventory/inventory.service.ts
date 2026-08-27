import type { PrismaClient, Prisma } from "../../generated/tenant-client/client";
import { AppError } from "../../utils/errors";
import { emitAccountingEvent } from "../accounting/accounting.service";
import { weightedAverageCost } from "./inventory.costing";
import { generateBatchNumber } from "./inventory.batch";
import type { ProductDto, WarehouseDto } from "./inventory.dto";
import { isLowStock, isUuid, suggestedReorderQuantity } from "./inventory.helpers";
import type { z } from "zod";
import type {
  createProductSchema,
  updateProductSchema,
  updateWarehouseSchema,
  listProductsQuerySchema,
  listTransfersQuerySchema,
} from "./inventory.validation";

type Db = PrismaClient | Prisma.TransactionClient;

// --- Catalog -------------------------------------------------------------

const productInclude = {
  category: {
    select: {
      id: true,
      name: true,
      parentId: true,
      parent: { select: { id: true, name: true } },
    },
  },
  unit: { select: { id: true, name: true, symbol: true } },
} as const;

function categoryLabels(
  category?: { name: string; parentId: string | null; parent?: { name: string } | null } | null,
): { categoryName: string | null; subcategoryName: string | null } {
  if (!category) return { categoryName: null, subcategoryName: null };
  if (category.parent) {
    return { categoryName: category.parent.name, subcategoryName: category.name };
  }
  return { categoryName: category.name, subcategoryName: null };
}

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
    maximumStock: unknown;
    reorderLevel: unknown;
    trackBatch: boolean;
    status: string;
    createdAt: Date;
    category?: { name: string; parentId: string | null; parent?: { name: string } | null } | null;
    unit?: { name: string; symbol: string } | null;
    stockBalances?: { quantity: unknown; damagedQuantity?: unknown }[];
  },
): ProductDto {
  const onHand = (row.stockBalances ?? []).reduce((sum, b) => sum + Number(b.quantity), 0);
  const damagedOnHand = (row.stockBalances ?? []).reduce((sum, b) => sum + Number(b.damagedQuantity ?? 0), 0);
  const labels = categoryLabels(row.category);
  return {
    id: row.id,
    sku: row.sku,
    barcode: row.barcode,
    name: row.name,
    description: row.description,
    categoryId: row.categoryId,
    categoryName: labels.categoryName,
    subcategoryName: labels.subcategoryName,
    unitId: row.unitId,
    unitName: row.unit?.name ?? null,
    unitSymbol: row.unit?.symbol ?? null,
    costPrice: Number(row.costPrice),
    sellingPrice: Number(row.sellingPrice),
    taxRate: Number(row.taxRate),
    minimumStock: Number(row.minimumStock),
    maximumStock: Number(row.maximumStock ?? 0),
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

export async function listProducts(
  tenantPrisma: PrismaClient,
  query: z.infer<typeof listProductsQuerySchema> | { barcode?: string } = {},
) {
  const barcode = "barcode" in query ? query.barcode : undefined;
  const search = "search" in query ? query.search?.trim() : undefined;
  const status = "status" in query ? query.status : undefined;
  const categoryId = "categoryId" in query ? query.categoryId : undefined;
  const page = "page" in query ? query.page : undefined;
  const pageSize = "pageSize" in query ? query.pageSize : undefined;
  const paginate = page != null && pageSize != null;

  const where: Prisma.ProductWhereInput = {
    ...(barcode ? { barcode } : {}),
    ...(status ? { status } : {}),
    ...(categoryId ? { categoryId } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { sku: { contains: search, mode: "insensitive" } },
            { barcode: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    tenantPrisma.product.count({ where }),
    tenantPrisma.product.findMany({
      where,
      include: { ...productInclude, stockBalances: { select: { quantity: true, damagedQuantity: true } } },
      orderBy: { createdAt: "desc" },
      ...(paginate ? { skip: (page! - 1) * pageSize!, take: pageSize! } : {}),
    }),
  ]);

  return {
    items: rows.map(toProductDto),
    meta: { page: paginate ? page! : 1, pageSize: paginate ? pageSize! : total, total },
  };
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
      maximumStock: input.maximumStock,
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
      ...(input.maximumStock !== undefined ? { maximumStock: input.maximumStock } : {}),
      ...(input.reorderLevel !== undefined ? { reorderLevel: input.reorderLevel } : {}),
      ...(input.trackBatch !== undefined ? { trackBatch: input.trackBatch } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    },
    include: { ...productInclude, stockBalances: { select: { quantity: true, damagedQuantity: true } } },
  });
  return toProductDto(row);
}

export async function deleteProduct(tenantPrisma: PrismaClient, id: string) {
  const existing = await tenantPrisma.product.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "PRODUCT_NOT_FOUND", "Product not found");

  const [balances, movements, batches, transferItems, saleItems] = await Promise.all([
    tenantPrisma.stockBalance.findMany({ where: { productId: id } }),
    tenantPrisma.stockMovement.count({ where: { productId: id } }),
    tenantPrisma.batch.findMany({ where: { productId: id } }),
    tenantPrisma.stockTransferItem.count({ where: { productId: id } }),
    tenantPrisma.saleItem.count({ where: { productId: id } }),
  ]);

  const hasStock = balances.some((b) => Number(b.quantity) !== 0 || Number(b.damagedQuantity ?? 0) !== 0);
  const hasBatchStock = batches.some((b) => Number(b.quantity) !== 0);
  if (hasStock || hasBatchStock || movements > 0 || transferItems > 0 || saleItems > 0) {
    throw new AppError(
      409,
      "PRODUCT_IN_USE",
      "Product has stock history or references and cannot be deleted. Deactivate it instead.",
    );
  }

  await tenantPrisma.$transaction(async (tx) => {
    await tx.stockBalance.deleteMany({ where: { productId: id } });
    await tx.batch.deleteMany({ where: { productId: id } });
    await tx.product.delete({ where: { id } });
  });

  return { id, deleted: true };
}

async function toWarehouseDto(
  tenantPrisma: PrismaClient,
  wh: {
    id: string;
    name: string;
    code: string;
    address: string | null;
    status: string;
  },
  opts?: { includeProducts?: boolean },
): Promise<WarehouseDto> {
  const includeProducts = opts?.includeProducts === true;
  const balances = await tenantPrisma.stockBalance.findMany({
    where: { warehouseId: wh.id },
    select: {
      productId: true,
      quantity: true,
      damagedQuantity: true,
      reservedQuantity: true,
      averageCost: true,
      ...(includeProducts
        ? { product: { select: { name: true, sku: true, barcode: true, status: true } } }
        : {}),
    },
  });
  const productIds = new Set(balances.filter((b) => Number(b.quantity) !== 0).map((b) => b.productId));
  const totalOnHand = balances.reduce((sum, b) => sum + Number(b.quantity), 0);
  const totalDamaged = balances.reduce((sum, b) => sum + Number(b.damagedQuantity), 0);
  const totalReserved = balances.reduce((sum, b) => sum + Number(b.reservedQuantity), 0);
  const dto: WarehouseDto = {
    id: wh.id,
    name: wh.name,
    code: wh.code,
    address: wh.address,
    status: wh.status,
    productCount: productIds.size,
    totalOnHand,
    totalDamaged,
    totalReserved,
  };
  if (includeProducts) {
    dto.products = balances
      .filter(
        (b) =>
          Number(b.quantity) !== 0 ||
          Number(b.damagedQuantity) !== 0 ||
          Number(b.reservedQuantity) !== 0,
      )
      .map((b) => {
        const product = "product" in b ? (b.product as { name: string; sku: string; barcode: string | null; status: string }) : null;
        return {
          productId: b.productId,
          name: product?.name ?? "",
          sku: product?.sku ?? "",
          barcode: product?.barcode ?? null,
          status: product?.status ?? "ACTIVE",
          quantity: Number(b.quantity),
          damagedQuantity: Number(b.damagedQuantity),
          reservedQuantity: Number(b.reservedQuantity),
          averageCost: Number(b.averageCost),
        };
      });
  }
  return dto;
}

export async function listWarehouses(tenantPrisma: PrismaClient) {
  const rows = await tenantPrisma.warehouse.findMany({ orderBy: { name: "asc" } });
  return Promise.all(rows.map((wh) => toWarehouseDto(tenantPrisma, wh)));
}

export async function createWarehouse(
  tenantPrisma: PrismaClient,
  tenantId: string,
  input: { name: string; code: string; address?: string; status?: "ACTIVE" | "INACTIVE" },
) {
  const row = await tenantPrisma.warehouse.create({
    data: {
      tenantId,
      name: input.name,
      code: input.code,
      address: input.address,
      status: input.status ?? "ACTIVE",
    },
  });
  return toWarehouseDto(tenantPrisma, row);
}

export async function updateWarehouse(
  tenantPrisma: PrismaClient,
  id: string,
  input: z.infer<typeof updateWarehouseSchema>,
) {
  const existing = await tenantPrisma.warehouse.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "WAREHOUSE_NOT_FOUND", "Warehouse not found");

  const row = await tenantPrisma.warehouse.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.code !== undefined ? { code: input.code } : {}),
      ...(input.address !== undefined ? { address: input.address } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    },
  });
  return toWarehouseDto(tenantPrisma, row);
}

export async function deleteWarehouse(tenantPrisma: PrismaClient, id: string) {
  const existing = await tenantPrisma.warehouse.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "WAREHOUSE_NOT_FOUND", "Warehouse not found");

  const [balances, openTransfers] = await Promise.all([
    tenantPrisma.stockBalance.findMany({ where: { warehouseId: id } }),
    tenantPrisma.stockTransfer.count({
      where: {
        OR: [{ fromWarehouseId: id }, { toWarehouseId: id }],
        status: { in: ["PENDING", "APPROVED", "DISPATCHED"] },
      },
    }),
  ]);

  if (balances.some((b) => Number(b.quantity) !== 0 || Number(b.damagedQuantity ?? 0) !== 0)) {
    throw new AppError(409, "WAREHOUSE_HAS_STOCK", "Warehouse still has stock and cannot be deleted");
  }
  if (openTransfers > 0) {
    throw new AppError(409, "WAREHOUSE_HAS_TRANSFERS", "Warehouse has open stock transfers and cannot be deleted");
  }

  const movements = await tenantPrisma.stockMovement.count({ where: { warehouseId: id } });
  if (movements > 0) {
    throw new AppError(
      409,
      "WAREHOUSE_IN_USE",
      "Warehouse has stock history and cannot be deleted. Set status to INACTIVE instead.",
    );
  }

  await tenantPrisma.$transaction(async (tx) => {
    await tx.stockBalance.deleteMany({ where: { warehouseId: id } });
    await tx.batch.deleteMany({ where: { warehouseId: id } });
    await tx.warehouse.delete({ where: { id } });
  });

  return { id, deleted: true };
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
  note?: string;
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
        note: input.note,
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

export async function getWarehouse(tenantPrisma: PrismaClient, id: string) {
  const row = await tenantPrisma.warehouse.findUnique({ where: { id } });
  if (!row) return null;
  return toWarehouseDto(tenantPrisma, row, { includeProducts: true });
}

export function listStockBalances(tenantPrisma: PrismaClient, warehouseId?: string) {
  return tenantPrisma.stockBalance.findMany({
    where: warehouseId ? { warehouseId } : undefined,
    orderBy: { productId: "asc" },
  });
}

type TransferListQuery = z.infer<typeof listTransfersQuerySchema>;

async function hydrateTransfer(
  tenantPrisma: PrismaClient,
  transfer: {
    id: string;
    tenantId: string;
    fromWarehouseId: string;
    toWarehouseId: string;
    status: string;
    requestedBy: string;
    approvedBy: string | null;
    dispatchedAt: Date | null;
    receivedAt: Date | null;
    createdAt: Date;
    items: { id: string; productId: string; quantity: unknown; unitCost: unknown }[];
  },
) {
  const [fromWh, toWh, requester, productRows] = await Promise.all([
    tenantPrisma.warehouse.findUnique({ where: { id: transfer.fromWarehouseId }, select: { id: true, name: true, code: true } }),
    tenantPrisma.warehouse.findUnique({ where: { id: transfer.toWarehouseId }, select: { id: true, name: true, code: true } }),
    tenantPrisma.user.findUnique({ where: { id: transfer.requestedBy }, select: { id: true, name: true, email: true } }),
    tenantPrisma.product.findMany({
      where: { id: { in: transfer.items.map((i) => i.productId) } },
      select: { id: true, name: true, sku: true },
    }),
  ]);
  const productById = new Map(productRows.map((p) => [p.id, p]));
  return {
    id: transfer.id,
    fromWarehouseId: transfer.fromWarehouseId,
    toWarehouseId: transfer.toWarehouseId,
    fromWarehouseName: fromWh?.name ?? null,
    toWarehouseName: toWh?.name ?? null,
    fromWarehouseCode: fromWh?.code ?? null,
    toWarehouseCode: toWh?.code ?? null,
    status: transfer.status,
    requestedBy: transfer.requestedBy,
    createdBy: requester?.name ?? requester?.email ?? transfer.requestedBy,
    approvedBy: transfer.approvedBy,
    dispatchedAt: transfer.dispatchedAt?.toISOString() ?? null,
    receivedAt: transfer.receivedAt?.toISOString() ?? null,
    createdAt: transfer.createdAt.toISOString(),
    itemCount: transfer.items.length,
    items: transfer.items.map((i) => ({
      id: i.id,
      productId: i.productId,
      productName: productById.get(i.productId)?.name ?? null,
      productSku: productById.get(i.productId)?.sku ?? null,
      quantity: Number(i.quantity),
      unitCost: Number(i.unitCost),
    })),
  };
}

export async function listTransfers(tenantPrisma: PrismaClient, query: TransferListQuery = {}) {
  const fromWarehouseId = query.sourceWarehouse ?? query.fromWarehouseId;
  const toWarehouseId = query.destinationWarehouse ?? query.toWarehouseId;
  const search = query.search?.trim();

  const where: Prisma.StockTransferWhereInput = {
    ...(fromWarehouseId ? { fromWarehouseId } : {}),
    ...(toWarehouseId ? { toWarehouseId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.dateFrom || query.dateTo
      ? {
          createdAt: {
            ...(query.dateFrom ? { gte: query.dateFrom } : {}),
            ...(query.dateTo ? { lte: query.dateTo } : {}),
          },
        }
      : {}),
  };

  if (search) {
    if (isUuid(search)) {
      where.id = search;
    } else {
      const [warehouses, products] = await Promise.all([
        tenantPrisma.warehouse.findMany({
          where: {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { code: { contains: search, mode: "insensitive" } },
            ],
          },
          select: { id: true },
        }),
        tenantPrisma.product.findMany({
          where: {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { sku: { contains: search, mode: "insensitive" } },
            ],
          },
          select: { id: true },
        }),
      ]);
      const warehouseIds = warehouses.map((w) => w.id);
      const productIds = products.map((p) => p.id);
      const or: Prisma.StockTransferWhereInput[] = [];
      if (warehouseIds.length) {
        or.push({ fromWarehouseId: { in: warehouseIds } });
        or.push({ toWarehouseId: { in: warehouseIds } });
      }
      if (productIds.length) {
        or.push({ items: { some: { productId: { in: productIds } } } });
      }
      where.OR = or.length ? or : [{ id: { in: [] } }];
    }
  }

  const page = query.page;
  const pageSize = query.pageSize;
  const paginate = page != null && pageSize != null;

  const [total, rows] = await Promise.all([
    tenantPrisma.stockTransfer.count({ where }),
    tenantPrisma.stockTransfer.findMany({
      where,
      include: { items: true },
      orderBy: { createdAt: "desc" },
      ...(paginate ? { skip: (page! - 1) * pageSize!, take: pageSize! } : {}),
    }),
  ]);

  const items = await Promise.all(rows.map((t) => hydrateTransfer(tenantPrisma, t)));
  return {
    items,
    meta: { page: paginate ? page! : 1, pageSize: paginate ? pageSize! : total, total },
  };
}

export async function getTransfer(tenantPrisma: PrismaClient, id: string) {
  const row = await tenantPrisma.stockTransfer.findUnique({
    where: { id },
    include: { items: true },
  });
  if (!row) return null;
  return hydrateTransfer(tenantPrisma, row);
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

const INBOUND_MOVEMENT_TYPES = ["PURCHASE_RECEIPT", "OPENING", "TRANSFER_IN", "SALES_RETURN"] as const;

export async function getDashboard(tenantPrisma: PrismaClient) {
  const [
    productCount,
    warehouseCount,
    balances,
    warehouses,
    adjustmentCount,
    inboundCount,
    recent,
    products,
  ] = await Promise.all([
    tenantPrisma.product.count(),
    tenantPrisma.warehouse.count(),
    tenantPrisma.stockBalance.findMany({
      select: {
        warehouseId: true,
        quantity: true,
        damagedQuantity: true,
        averageCost: true,
      },
    }),
    tenantPrisma.warehouse.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    tenantPrisma.stockMovement.count({ where: { movementType: "ADJUSTMENT" } }),
    tenantPrisma.stockMovement.count({ where: { movementType: { in: [...INBOUND_MOVEMENT_TYPES] } } }),
    tenantPrisma.stockMovement.findMany({
      orderBy: { movementDate: "desc" },
      take: 10,
      select: {
        id: true,
        movementDate: true,
        movementType: true,
        quantity: true,
        productId: true,
        warehouseId: true,
      },
    }),
    tenantPrisma.product.findMany({
      where: { status: "ACTIVE" },
      select: {
        id: true,
        name: true,
        sku: true,
        reorderLevel: true,
        minimumStock: true,
        stockBalances: { select: { quantity: true } },
      },
    }),
  ]);

  const warehouseName = new Map(warehouses.map((w) => [w.id, w.name]));
  let stockValue = 0;
  const byWarehouse = new Map<string, { value: number; onHand: number; damagedOnHand: number }>();
  for (const row of balances) {
    const qty = Number(row.quantity);
    const damaged = Number(row.damagedQuantity);
    const value = qty * Number(row.averageCost);
    stockValue += value;
    const current = byWarehouse.get(row.warehouseId) ?? { value: 0, onHand: 0, damagedOnHand: 0 };
    current.value += value;
    current.onHand += qty;
    current.damagedOnHand += damaged;
    byWarehouse.set(row.warehouseId, current);
  }

  const stockValueByWarehouse = [...byWarehouse.entries()]
    .map(([warehouseId, agg]) => ({
      warehouseId,
      name: warehouseName.get(warehouseId) ?? warehouseId.slice(0, 8),
      value: agg.value,
      onHand: agg.onHand,
      damagedOnHand: agg.damagedOnHand,
    }))
    .sort((a, b) => b.value - a.value);

  const productNameById = new Map(products.map((p) => [p.id, p.name]));
  const missingNames = [...new Set(recent.map((m) => m.productId).filter((id) => !productNameById.has(id)))];
  if (missingNames.length) {
    const extra = await tenantPrisma.product.findMany({
      where: { id: { in: missingNames } },
      select: { id: true, name: true },
    });
    for (const p of extra) productNameById.set(p.id, p.name);
  }

  const lowStock = products
    .map((p) => {
      const stock = p.stockBalances.reduce((sum, b) => sum + Number(b.quantity), 0);
      return {
        productId: p.id,
        name: p.name,
        sku: p.sku,
        stock,
        reorderLevel: Number(p.reorderLevel),
        minimumStock: Number(p.minimumStock),
      };
    })
    .filter((p) => isLowStock("ACTIVE", p.stock, p.reorderLevel, p.minimumStock))
    .sort((a, b) => a.stock - b.stock)
    .slice(0, 8);

  return {
    productCount,
    warehouseCount,
    stockValue,
    adjustmentCount,
    inboundCount,
    stockValueByWarehouse,
    recentMovements: recent.map((m) => ({
      id: m.id,
      movementDate: m.movementDate.toISOString(),
      movementType: m.movementType,
      quantity: Number(m.quantity),
      productId: m.productId,
      productName: productNameById.get(m.productId) ?? null,
      warehouseId: m.warehouseId,
    })),
    lowStock,
  };
}

export async function listReorder(tenantPrisma: PrismaClient, warehouseId?: string) {
  const products = await tenantPrisma.product.findMany({
    where: { status: "ACTIVE" },
    select: {
      id: true,
      name: true,
      sku: true,
      reorderLevel: true,
      minimumStock: true,
      maximumStock: true,
      costPrice: true,
      stockBalances: {
        where: warehouseId ? { warehouseId } : undefined,
        select: { quantity: true },
      },
    },
  });

  return products
    .map((p) => {
      const stock = p.stockBalances.reduce((sum, b) => sum + Number(b.quantity), 0);
      const reorderLevel = Number(p.reorderLevel);
      const minimumStock = Number(p.minimumStock);
      return {
        productId: p.id,
        name: p.name,
        sku: p.sku,
        stock,
        reorderLevel,
        minimumStock,
        maximumStock: Number(p.maximumStock ?? 0),
        suggestedQuantity: suggestedReorderQuantity(reorderLevel, stock),
        costPrice: Number(p.costPrice),
      };
    })
    .filter((p) => isLowStock("ACTIVE", p.stock, p.reorderLevel, p.minimumStock))
    .sort((a, b) => a.stock - b.stock);
}

export async function getValuation(tenantPrisma: PrismaClient, warehouseId?: string) {
  const [balances, products, warehouses] = await Promise.all([
    tenantPrisma.stockBalance.findMany({
      where: warehouseId ? { warehouseId } : undefined,
      select: {
        productId: true,
        warehouseId: true,
        quantity: true,
        averageCost: true,
      },
    }),
    tenantPrisma.product.findMany({ select: { id: true, sku: true, name: true } }),
    tenantPrisma.warehouse.findMany({ select: { id: true, name: true } }),
  ]);
  const productById = new Map(products.map((p) => [p.id, p]));
  const warehouseById = new Map(warehouses.map((w) => [w.id, w]));
  const rows = balances
    .map((b) => {
      const quantity = Number(b.quantity);
      const averageCost = Number(b.averageCost);
      const product = productById.get(b.productId);
      const warehouse = warehouseById.get(b.warehouseId);
      return {
        productId: b.productId,
        sku: product?.sku ?? b.productId.slice(0, 8),
        name: product?.name ?? "Unknown product",
        warehouseId: b.warehouseId,
        warehouseName: warehouse?.name ?? b.warehouseId.slice(0, 8),
        quantity,
        averageCost,
        value: quantity * averageCost,
      };
    })
    .sort((a, b) => b.value - a.value);
  const totalValue = rows.reduce((sum, r) => sum + r.value, 0);
  return { method: "WEIGHTED_AVERAGE" as const, totalValue, rows };
}
