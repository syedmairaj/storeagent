import { parseInventoryAttentionFilter } from "@/lib/inventory-intelligence/attention";
import type { InventoryIntelligenceFilter } from "@/lib/inventory-intelligence/types";

/**
 * Build the Inventory filter query string for chip clicks.
 * Preserves unrelated params; "all" removes `filter` entirely.
 * Does not include a hash — in-page chips must not trigger hash scroll.
 */
export function buildInventoryFilterQuery(
  currentSearch: string,
  next: InventoryIntelligenceFilter,
): string {
  const params = new URLSearchParams(
    currentSearch.startsWith("?") ? currentSearch.slice(1) : currentSearch,
  );
  if (next === "all") {
    params.delete("filter");
  } else {
    params.set("filter", next);
  }
  return params.toString();
}

export function inventoryFilterPath(
  pathname: string,
  currentSearch: string,
  next: InventoryIntelligenceFilter,
): string {
  const query = buildInventoryFilterQuery(currentSearch, next);
  return query ? `${pathname}?${query}` : pathname;
}

/**
 * Resolve the merchant filter from a location search string.
 * Invalid / missing values fall back (reload + Back/Forward safe).
 */
export function resolveInventoryFilterFromSearch(
  search: string,
  fallback: InventoryIntelligenceFilter = "all",
): InventoryIntelligenceFilter {
  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  );
  return parseInventoryAttentionFilter(params.get("filter")) ?? fallback;
}

/**
 * Keep an open inspector only when the selected grain remains in the
 * post-filter result set. Otherwise close safely (null).
 */
export function resolveInspectorSelectionAfterFilter(
  selectedGrainKey: string | null,
  visibleGrainKeys: ReadonlySet<string> | readonly string[],
): string | null {
  if (!selectedGrainKey) {
    return null;
  }
  const set =
    visibleGrainKeys instanceof Set
      ? visibleGrainKeys
      : new Set(visibleGrainKeys);
  return set.has(selectedGrainKey) ? selectedGrainKey : null;
}
