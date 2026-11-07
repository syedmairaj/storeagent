export function normalizeMerchantHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s\-]+/g, "_")
    .replace(/__+/g, "_");
}
