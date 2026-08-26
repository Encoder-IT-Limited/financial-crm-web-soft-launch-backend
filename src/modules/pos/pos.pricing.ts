import { roundMoney } from "../invoicing/invoicing.totals";

export function discountFromRule(
  type: "PERCENTAGE" | "FIXED",
  value: number,
  quantity: number,
  unitPrice: number,
): number {
  const subtotal = quantity * unitPrice;
  const raw = type === "PERCENTAGE" ? (subtotal * value) / 100 : value;
  return roundMoney(Math.min(Math.max(raw, 0), Math.max(subtotal, 0)));
}

export function taxFromRate(quantity: number, unitPrice: number, discount: number, taxRate: number): number {
  const net = Math.max(quantity * unitPrice - discount, 0);
  return roundMoney(net * (taxRate / 100));
}

export function lineTotal(quantity: number, unitPrice: number, discount: number, tax: number): number {
  return roundMoney(quantity * unitPrice - discount + tax);
}
