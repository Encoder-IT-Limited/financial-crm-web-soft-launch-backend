/** Tenant base currency, used when a document does not store its own. */
export function resolveCurrency(...candidates: Array<string | null | undefined>): string {
  for (const value of candidates) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed.toUpperCase();
  }
  return "AED";
}

export function withCurrency<T extends object>(doc: T, currency: string): T & { currency: string } {
  return { ...doc, currency };
}
