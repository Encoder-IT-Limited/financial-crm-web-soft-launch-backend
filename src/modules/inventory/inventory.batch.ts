export function generateBatchNumber(now = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const seq = now.getUTCMilliseconds().toString(36).toUpperCase().padStart(3, "0");
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `BAT-${y}${m}${d}-${seq}${rand}`;
}
