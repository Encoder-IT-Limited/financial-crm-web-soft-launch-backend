import { z } from "zod";

export const createSupplierSchema = z.object({
  supplierCode: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  taxNumber: z.string().optional(),
  openingBalance: z.number().default(0),
});

export const poItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().positive(),
  unitCost: z.number().nonnegative(),
  tax: z.number().nonnegative().default(0),
  discount: z.number().nonnegative().default(0),
});

export const createPurchaseOrderSchema = z.object({
  supplierId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  expectedDate: z.coerce.date().optional(),
  items: z.array(poItemSchema).min(1),
});

export const goodsReceiptItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().positive(),
  batchNumber: z.string().optional(),
  expiryDate: z.coerce.date().optional(),
});

export const createGoodsReceiptSchema = z.object({
  items: z.array(goodsReceiptItemSchema).min(1),
});

export const createPurchaseInvoiceSchema = z.object({
  supplierId: z.string().uuid(),
  purchaseOrderId: z.string().uuid().optional(),
  dueDate: z.coerce.date(),
  subtotal: z.number().nonnegative(),
  tax: z.number().nonnegative().default(0),
  discount: z.number().nonnegative().default(0),
});

export const recordSupplierPaymentSchema = z.object({
  amount: z.number().positive(),
  paymentMethod: z.enum(["CASH", "CARD", "BANK", "MOBILE_PAYMENT", "CHEQUE", "OTHER"]),
  transactionReference: z.string().optional(),
});
