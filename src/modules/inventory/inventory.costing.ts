/** Weighted Average Cost — Phase 1 valuation method (docs/requirements-qa.md). */
export function weightedAverageCost(
  existingQty: number,
  existingAvgCost: number,
  incomingQty: number,
  incomingUnitCost: number,
): { newQty: number; newAvgCost: number } {
  const newQty = existingQty + incomingQty;
  const newAvgCost =
    newQty > 0 ? (existingQty * existingAvgCost + incomingQty * incomingUnitCost) / newQty : 0;
  return { newQty, newAvgCost };
}
