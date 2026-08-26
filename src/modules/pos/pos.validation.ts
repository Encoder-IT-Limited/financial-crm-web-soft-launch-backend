import { z } from "zod";

export const createTerminalSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  warehouseId: z.string().uuid(),
  deviceIdentifier: z.string().optional(),
  accessCode: z.string().min(4).max(12),
});

export const updateTerminalSchema = z.object({
  name: z.string().min(1).optional(),
  code: z.string().min(1).optional(),
  warehouseId: z.string().uuid().optional(),
  deviceIdentifier: z.string().nullable().optional(),
  accessCode: z.string().min(4).max(12).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

export const openSessionSchema = z.object({
  terminalId: z.string().uuid(),
  openingCash: z.number().nonnegative(),
  accessCode: z.string().min(1),
  cashierName: z.string().min(1).max(120),
});

export const closeSessionSchema = z.object({
  closingCash: z.number().nonnegative(),
});

export const managerPinSchema = z.object({
  pin: z.string().regex(/^\d{4,8}$/, "PIN must be 4–8 digits"),
  currentPin: z.string().regex(/^\d{4,8}$/).optional(),
});

export const createDiscountRuleSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["PERCENTAGE", "FIXED"]),
  value: z.number().positive(),
  active: z.boolean().default(true),
});

export const updateDiscountRuleSchema = z.object({
  name: z.string().min(1).optional(),
  value: z.number().positive().optional(),
  active: z.boolean().optional(),
});

export const saleItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative(),
  discount: z.number().nonnegative().default(0),
  discountRuleId: z.string().uuid().optional(),
  tax: z.number().nonnegative().optional(),
});

export const salePaymentSchema = z.object({
  paymentMethod: z.enum(["CASH", "CARD", "BANK", "MOBILE_PAYMENT", "CHEQUE", "OTHER"]),
  amount: z.number().positive(),
  transactionReference: z.string().optional(),
});

export const createSaleSchema = z
  .object({
    posSessionId: z.string().uuid(),
    customerId: z.string().uuid().optional(),
    items: z.array(saleItemSchema).min(1),
    payments: z.array(salePaymentSchema).min(1),
    isOfflineSync: z.boolean().default(false),
    deviceId: z.string().optional(),
    offlineTransactionKey: z.string().optional(),
    transactionDate: z.coerce.date().optional(),
    managerPin: z.string().optional(),
  })
  .refine((v) => !v.isOfflineSync || (v.deviceId && v.offlineTransactionKey), {
    message: "deviceId and offlineTransactionKey are required for offline-synced sales",
  });

export const refundSaleItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative(),
  condition: z.enum(["SELLABLE", "DAMAGED"]),
});

export const refundSaleSchema = z.object({
  items: z.array(refundSaleItemSchema).min(1),
  reason: z.string().optional(),
  managerPin: z.string().optional(),
});

export const voidSaleSchema = z.object({
  managerPin: z.string().optional(),
});

export const exchangeSaleSchema = z.object({
  returns: z.array(refundSaleItemSchema).min(1),
  replacements: z.array(saleItemSchema).min(1),
  payments: z.array(salePaymentSchema).default([]),
  reason: z.string().optional(),
  managerPin: z.string().optional(),
});

export const reportSyncFailureSchema = z.object({
  deviceId: z.string().min(1),
  offlineTransactionKey: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
  lastError: z.string().min(1),
});

export const resolveSyncFailureSchema = z.object({
  status: z.enum(["RESOLVED", "DISCARDED"]),
});
