import { describe, expect, it } from "vitest";

import { aggregateInventoryMetrics } from "@/lib/metrics/inventory-aggregates";
import { aggregateSales } from "@/lib/metrics/sales-aggregates";
import { toPersistedSkuDailyMetric } from "@/lib/metrics/sku-daily-metric-record";

const METRIC_DATE = "2026-10-14";

function persisted() {
  const sales = aggregateSales({
    organizationId: "org",
    storeId: "store",
    locationId: "loc",
    variantId: "variant",
    metricDate: METRIC_DATE,
    timeZone: "Asia/Dubai",
    orders: [],
    orderItems: [],
    returnRefunds: [],
    inventorySnapshots: [
      {
        id: "snap-1",
        organizationId: "org",
        storeId: "store",
        locationId: "loc",
        variantId: "variant",
        observedAt: "2026-10-14T08:00:00Z",
        availableQuantity: 0,
      },
    ],
  });
  const day = sales.days.find(
    (candidate) => candidate.metricDate === METRIC_DATE,
  );

  if (day === undefined) {
    throw new Error("missing metric day");
  }

  const inventory = aggregateInventoryMetrics({
    organizationId: "org",
    storeId: "store",
    locationId: "loc",
    variantId: "variant",
    metricDate: METRIC_DATE,
    timeZone: "Asia/Dubai",
    snapshots: salesInputSnapshots(),
    demand: {
      netUnitsSold: day.netUnitsSold,
      salesVelocity30d: sales.windows[30].velocity,
      days: sales.days,
    },
  });

  return toPersistedSkuDailyMetric(
    METRIC_DATE,
    "Asia/Dubai",
    sales,
    inventory,
  );
}

function salesInputSnapshots() {
  return [
    {
      id: "snap-1",
      organizationId: "org",
      storeId: "store",
      locationId: "loc",
      variantId: "variant",
      observedAt: "2026-10-14T08:00:00Z",
      availableQuantity: 0,
    },
  ];
}

describe("M5.5 persisted metric record", () => {
  it("preserves known zero, null reasons, and unknown incoming and age", () => {
    const metric = persisted();

    expect(metric.unitsSold).toBe(0);
    expect(metric.netUnitsSold).toBe(0);
    expect(metric.eligibleDays7d).toBe(1);
    expect(metric.salesVelocity30d).toBe(0);
    expect(metric.salesVelocity30dReasonCode).toBeNull();
    expect(metric.availableQuantity).toBe(0);
    expect(metric.daysOfStock).toBeNull();
    expect(metric.daysOfStockReasonCode).toBe("zero_demand");
    expect(metric.sellThroughReasonCode).toBe(
      "sell_through_denominator_zero",
    );
    expect(metric.eligibleIncomingQuantity).toBeNull();
    expect(metric.eligibleIncomingReasonCode).toBe(
      "incoming_state_unknown",
    );
    expect(metric.inventoryPosition).toBeNull();
    expect(metric.inventoryAgeDays).toBeNull();
    expect(metric.inventoryAgeQuality).toBe("unavailable");
    expect(metric.inventoryAgeReasonCode).toBe(
      "inventory_age_unknown",
    );
    expect(metric).not.toHaveProperty("coverageRatio7d");
  });

  it("lowercases an unknown-demand reason without turning it into zero", () => {
    const sales = aggregateSales({
      organizationId: "org",
      storeId: "store",
      locationId: "loc",
      variantId: "variant",
      metricDate: METRIC_DATE,
      timeZone: "UTC",
      orders: [],
      orderItems: [],
      returnRefunds: [],
      inventorySnapshots: [],
    });
    const inventory = aggregateInventoryMetrics({
      organizationId: "org",
      storeId: "store",
      locationId: "loc",
      variantId: "variant",
      metricDate: METRIC_DATE,
      timeZone: "UTC",
      snapshots: [],
      demand: {
        netUnitsSold: 0,
        salesVelocity30d: null,
        days: sales.days,
      },
    });
    const metric = toPersistedSkuDailyMetric(
      METRIC_DATE,
      "UTC",
      sales,
      inventory,
    );

    expect(metric.salesVelocity30d).toBeNull();
    expect(metric.salesVelocity30dReasonCode).toBe("no_eligible_days");
    expect(metric.availableQuantity).toBeNull();
    expect(metric.daysOfStockReasonCode).toBe("demand_unknown");
    expect(metric.safetyStock).toBeNull();
    expect(metric.safetyStockReasonCode).toBe("demand_unknown");
    expect(metric.demandTrend).toBe("unknown");
    expect(metric.demandTrendReasonCode).toBe("trend_input_unknown");
  });
});
