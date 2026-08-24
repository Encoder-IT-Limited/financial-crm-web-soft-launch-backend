import { z } from "zod";

export const createCategorySchema = z.object({
  name: z.string().min(1),
  parentId: z.string().uuid().optional(),
});

export const createUnitSchema = z.object({
  name: z.string().min(1),
  symbol: z.string().min(1),
});

export const createProductSchema = z.object({
  sku: z.string().min(1),
  barcode: z.string().optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  categoryId: z.string().uuid().optional(),
  unitId: z.string().uuid().optional(),
  costPrice: z.number().nonnegative().default(0),
  sellingPrice: z.number().nonnegative().default(0),
  taxRate: z.number().min(0).max(100).default(0),
  minimumStock: z.number().nonnegative().default(0),
  reorderLevel: z.number().nonnegative().default(0),
  trackBatch: z.boolean().default(true),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
});

export const updateProductSchema = createProductSchema.partial();

export const createWarehouseSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  address: z.string().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
});

export const receiveStockSchema = z.object({
  productId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  quantity: z.number().positive(),
  unitCost: z.number().nonnegative(),
  batchNumber: z.string().optional(),
  expiryDate: z.coerce.date().optional(),
  manufactureDate: z.coerce.date().optional(),
  movementType: z.enum(["PURCHASE_RECEIPT", "OPENING", "SALES_RETURN", "TRANSFER_IN"]).default("PURCHASE_RECEIPT"),
  referenceType: z.string().optional(),
  referenceId: z.string().uuid().optional(),
});

export const issueStockSchema = z.object({
  productId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  quantity: z.number().positive(),
  movementType: z
    .enum(["SALE", "PURCHASE_RETURN", "DAMAGE", "EXPIRY", "MANUAL_ISSUE", "TRANSFER_OUT"])
    .default("MANUAL_ISSUE"),
  allowNegative: z.boolean().default(false),
  referenceType: z.string().optional(),
  referenceId: z.string().uuid().optional(),
});

export const adjustStockSchema = z.object({
  productId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  quantityDelta: z.number().refine((v) => v !== 0, "quantityDelta must not be zero"),
  referenceType: z.string().optional(),
  referenceId: z.string().uuid().optional(),
});

export const createTransferSchema = z.object({
  fromWarehouseId: z.string().uuid(),
  toWarehouseId: z.string().uuid(),
  items: z
    .array(z.object({ productId: z.string().uuid(), quantity: z.number().positive() }))
    .min(1),
});
