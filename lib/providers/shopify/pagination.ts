export function normalizeShopifyCursor(
  value: string | null | undefined,
): string | null {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const normalized =
    value.trim();

  return normalized || null;
}

/**
 * Pagination cursors are deliberately opaque.
 *
 * StoreAgent may persist them as SyncRun cursor provenance, but must
 * never parse them into business identity.
 */
export function shopifyCursorForSyncRun(
  value: string | null | undefined,
): string | null {
  return normalizeShopifyCursor(
    value,
  );
}
