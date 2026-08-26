export function formatDocumentNumber(prefix: string, count: number, width = 6): string {
  return `${prefix}-${String(count + 1).padStart(width, "0")}`;
}

export async function peekNextNumber(
  count: () => Promise<number>,
  prefix: string,
  width = 6,
): Promise<{ number: string }> {
  return { number: formatDocumentNumber(prefix, await count(), width) };
}
