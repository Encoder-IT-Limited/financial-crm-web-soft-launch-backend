export interface InvoiceLineInput {
  quantity: number;
  unitPrice: number;
  discount: number;
  tax: number;
}

export function computeInvoiceTotals(items: InvoiceLineInput[]) {
  let subtotal = 0;
  let discount = 0;
  let tax = 0;
  for (const item of items) {
    subtotal += item.quantity * item.unitPrice;
    discount += item.discount;
    tax += item.tax;
  }
  const total = roundMoney(subtotal - discount + tax);
  return {
    subtotal: roundMoney(subtotal),
    discount: roundMoney(discount),
    tax: roundMoney(tax),
    total,
  };
}

export function lineTotal(item: InvoiceLineInput): number {
  return roundMoney(item.quantity * item.unitPrice - item.discount + item.tax);
}

export function isOverdue(invoice: { status: string; dueDate: Date }, now = Date.now()): boolean {
  return (
    (invoice.status === "SENT" || invoice.status === "PARTIALLY_PAID") && invoice.dueDate.getTime() < now
  );
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function nextInvoiceStatus(paidAmount: number, total: number): "PAID" | "PARTIALLY_PAID" | "SENT" {
  if (paidAmount >= total - 0.005) return "PAID";
  if (paidAmount > 0) return "PARTIALLY_PAID";
  return "SENT";
}
