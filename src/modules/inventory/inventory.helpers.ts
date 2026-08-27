const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function suggestedReorderQuantity(reorderLevel: number, stock: number): number {
  return Math.max(1, reorderLevel * 2 - stock);
}

export function isLowStock(
  status: string,
  onHand: number,
  reorderLevel: number,
  minimumStock: number,
): boolean {
  return status === "ACTIVE" && onHand <= Math.max(reorderLevel, minimumStock);
}

export function compactQuery(query: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(query).filter(([, value]) => value !== "" && value !== undefined),
  );
}
