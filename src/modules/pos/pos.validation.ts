import { z } from "zod";

export const createTerminalSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  warehouseId: z.string().uuid(),
  deviceIdentifier: z.string().optional(),
});

export const openSessionSchema = z.object({
  terminalId: z.string().uuid(),
  openingCash: z.number().nonnegative(),
});

export const closeSessionSchema = z.object({
  closingCash: z.number().nonnegative(),
});

export const saleItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative(),
  discount: z.number().nonnegative().default(0),
  tax: z.number().nonnegative().default(0),
});

export const salePaymentSchema = z.object({
  paymentMethod: z.enum(["CASH", "CARD", "BANK", "MOBILE_PAYMENT", "CHEQUE", "OTHER"]),
  amount: z.number().positive(),
  transactionReference: z.string().optional(),
});

// isOfflineSync governs the stock-check policy: true allows the sale to post
// even when it oversells (deviceId/offlineTransactionKey required, so a
// retried sync can't double-post it), per docs/requirements-qa.md's offline
// POS conflict-handling answers.
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
});
