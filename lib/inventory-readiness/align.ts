/**
 * Pure grain-alignment helpers for decision readiness.
 * No I/O — safe for unit tests and the member-scoped loader.
 */

export type InventoryGrainForAlignment = {
  store_id: string;
  location_id: string;
  variant_id: string;
  available_quantity: number | null;
};

export type MetricGrainForAlignment = {
  store_id: string;
  location_id: string;
  variant_id: string;
  metric_date: string;
  sales_velocity_30d: number | null;
};

function grainKey(row: {
  store_id: string;
  location_id: string;
  variant_id: string;
}): string {
  return `${row.store_id}:${row.location_id}:${row.variant_id}`;
}

/**
 * Count latest inventory grains that have a matching org/store/location/variant
 * metric for the store-local as-of (current) metric_date with known
 * sales_velocity_30d. Org-wide metric existence is not enough. Stale
 * metric_dates (older than as-of) do not unlock cover. Null velocity
 * fails closed (unknown ≠ zero); numeric zero counts as known.
 */
export function countGrainAlignedKnownDemand(input: {
  inventoryGrains: readonly InventoryGrainForAlignment[];
  metrics: readonly MetricGrainForAlignment[];
  /**
   * Store-local YYYY-MM-DD as-of date per store_id. Missing store entries
   * fail closed (no alignment).
   */
  asOfMetricDateByStoreId: ReadonlyMap<string, string>;
}): number {
  const currentMetricByGrain = new Map<string, MetricGrainForAlignment>();
  for (const row of input.metrics) {
    const asOf = input.asOfMetricDateByStoreId.get(row.store_id);
    if (asOf === undefined || row.metric_date !== asOf) {
      continue;
    }
    const key = grainKey(row);
    const existing = currentMetricByGrain.get(key);
    if (!existing) {
      currentMetricByGrain.set(key, row);
    }
  }

  let aligned = 0;
  for (const grain of input.inventoryGrains) {
    if (grain.available_quantity === null) {
      continue;
    }
    const metric = currentMetricByGrain.get(grainKey(grain));
    if (metric && metric.sales_velocity_30d !== null) {
      aligned += 1;
    }
  }
  return aligned;
}
