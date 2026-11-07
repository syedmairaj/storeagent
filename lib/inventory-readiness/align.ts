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
 * metric with known sales_velocity_30d. Org-wide metric existence is not enough.
 * Null velocity fails closed (unknown ≠ zero).
 */
export function countGrainAlignedKnownDemand(input: {
  inventoryGrains: readonly InventoryGrainForAlignment[];
  metrics: readonly MetricGrainForAlignment[];
}): number {
  const latestMetricByGrain = new Map<string, MetricGrainForAlignment>();
  for (const row of input.metrics) {
    const key = grainKey(row);
    const existing = latestMetricByGrain.get(key);
    if (!existing || row.metric_date > existing.metric_date) {
      latestMetricByGrain.set(key, row);
    }
  }

  let aligned = 0;
  for (const grain of input.inventoryGrains) {
    if (grain.available_quantity === null) {
      continue;
    }
    const metric = latestMetricByGrain.get(grainKey(grain));
    if (metric && metric.sales_velocity_30d !== null) {
      aligned += 1;
    }
  }
  return aligned;
}
