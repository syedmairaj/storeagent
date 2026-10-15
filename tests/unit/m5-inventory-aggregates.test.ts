import { describe, expect, it } from "vitest";

import {
  aggregateInventoryMetrics,
  sellThroughFromUnits,
  type InventoryAggregateInput,
} from "@/lib/metrics/inventory-aggregates";

const ORG = "org-a";
const STORE = "store-a";
const LOCATION = "loc-a";
const VARIANT = "variant-a";

function input(
  overrides: Partial<InventoryAggregateInput> = {},
): InventoryAggregateInput {
  return {
    organizationId: ORG,
    storeId: STORE,
    locationId: LOCATION,
    variantId: VARIANT,
    metricDate: "2026-10-14",
    timeZone: "Asia/Dubai",
    snapshots: [],
    demand: {
      netUnitsSold: 0,
      salesVelocity30d: 2,
      days: [],
    },
    ...overrides,
  };
}

function snapshot(
  id: string,
  observedAt: string,
  availableQuantity: number | null,
  locationId = LOCATION,
) {
  return {
    id,
    organizationId: ORG,
    storeId: STORE,
    locationId,
    variantId: VARIANT,
    observedAt,
    availableQuantity,
  };
}

describe("M5.4 inventory aggregates", () => {
  it("ignores another organization, store, location, or variant", () => {
    const result = aggregateInventoryMetrics(
      input({
        snapshots: [
          {
            ...snapshot("other-org", "2026-10-14T08:00:00Z", 9),
            organizationId: "org-b",
          },
          {
            ...snapshot("other-store", "2026-10-14T08:00:00Z", 8),
            storeId: "store-b",
          },
          snapshot("other-location", "2026-10-14T08:00:00Z", 7, "loc-b"),
          {
            ...snapshot("other-variant", "2026-10-14T08:00:00Z", 6),
            variantId: "variant-b",
          },
        ],
      }),
    );

    expect(result.availableQuantity).toBeNull();
    expect(result.daysOfStockReasonCode).toBe("INVENTORY_UNKNOWN");
  });

  it("selects the latest same-day snapshot and breaks ties by id", () => {
    const result = aggregateInventoryMetrics(
      input({
        snapshots: [
          snapshot("a", "2026-10-14T08:00:00Z", 1),
          snapshot("b", "2026-10-14T12:00:00Z", 4),
          snapshot("c", "2026-10-14T12:00:00Z", 9),
        ],
      }),
    );

    expect(result.availableQuantity).toBe(9);
  });

  it("treats a same-day zero as known zero and a missing snapshot as unknown", () => {
    const knownZero = aggregateInventoryMetrics(
      input({
        snapshots: [snapshot("zero", "2026-10-14T08:00:00Z", 0)],
      }),
    );
    const missing = aggregateInventoryMetrics(input());

    expect(knownZero.availableQuantity).toBe(0);
    expect(knownZero.daysOfStock).toBe(0);
    expect(knownZero.daysOfStockReasonCode).toBeNull();
    expect(missing.availableQuantity).toBeNull();
    expect(missing.daysOfStock).toBeNull();
    expect(missing.daysOfStockReasonCode).toBe("INVENTORY_UNKNOWN");
  });

  it("excludes a negative available quantity", () => {
    const result = aggregateInventoryMetrics(
      input({
        snapshots: [
          snapshot("negative", "2026-10-14T18:00:00Z", -1),
          snapshot("known", "2026-10-14T08:00:00Z", 3),
        ],
      }),
    );

    expect(result.availableQuantity).toBe(3);
  });

  it("ignores a prior local day and applies the Dubai date boundary", () => {
    const prior = aggregateInventoryMetrics(
      input({
        snapshots: [snapshot("prior", "2026-10-13T08:00:00Z", 6)],
      }),
    );
    const boundary = aggregateInventoryMetrics(
      input({
        metricDate: "2026-10-08",
        snapshots: [snapshot("dubai", "2026-10-07T22:30:00Z", 5)],
      }),
    );
    const previousLocalDay = aggregateInventoryMetrics(
      input({
        metricDate: "2026-10-07",
        snapshots: [snapshot("dubai", "2026-10-07T22:30:00Z", 5)],
      }),
    );

    expect(prior.availableQuantity).toBeNull();
    expect(boundary.availableQuantity).toBe(5);
    expect(previousLocalDay.availableQuantity).toBeNull();
  });

  it("fails closed for an unrecognized timezone", () => {
    expect(() =>
      aggregateInventoryMetrics(input({ timeZone: "Not/AZone" })),
    ).toThrow("stores.timezone must be a recognized IANA timezone.");
  });

  it("returns the denominator-zero reason and a null exceed result", () => {
    const zero = aggregateInventoryMetrics(
      input({
        demand: {
          netUnitsSold: 0,
          salesVelocity30d: 2,
          days: [],
        },
        snapshots: [snapshot("zero", "2026-10-14T08:00:00Z", 0)],
      }),
    );

    expect(zero.sellThroughRate).toBeNull();
    expect(zero.sellThroughReasonCode).toBe(
      "SELL_THROUGH_DENOMINATOR_ZERO",
    );
    expect(sellThroughFromUnits(5, 3)).toEqual({
      rate: null,
      reasonCode: null,
    });
    expect(
      aggregateInventoryMetrics(
        input({
          demand: {
            netUnitsSold: 2,
            salesVelocity30d: 2,
            days: [],
          },
          snapshots: [snapshot("stock", "2026-10-14T08:00:00Z", 2)],
        }),
      ).sellThroughRate,
    ).toBe(0.5);
  });

  it("distinguishes null and zero 30-day velocity", () => {
    const unknown = aggregateInventoryMetrics(
      input({
        snapshots: [snapshot("stock", "2026-10-14T08:00:00Z", 10)],
        demand: {
          netUnitsSold: 0,
          salesVelocity30d: null,
          days: [],
        },
        planning: {
          safetyStockDays: 5,
          leadTimeDays: 4,
          reviewPeriodDays: 3,
        },
      }),
    );
    const zero = aggregateInventoryMetrics(
      input({
        snapshots: [snapshot("stock", "2026-10-14T08:00:00Z", 10)],
        demand: {
          netUnitsSold: 0,
          salesVelocity30d: 0,
          days: [],
        },
        planning: {
          safetyStockDays: 5,
          leadTimeDays: 4,
          reviewPeriodDays: 3,
        },
      }),
    );

    expect(unknown.daysOfStockReasonCode).toBe("DEMAND_UNKNOWN");
    expect(unknown.safetyStockReasonCode).toBe("DEMAND_UNKNOWN");
    expect(unknown.reorderPoint).toBeNull();
    expect(unknown.targetStock).toBeNull();
    expect(zero.daysOfStockReasonCode).toBe("ZERO_DEMAND");
    expect(zero.safetyStock).toBe(0);
    expect(zero.reorderPoint).toBe(0);
    expect(zero.targetStock).toBe(0);
  });

  it("returns null thresholds when planning settings are missing", () => {
    const result = aggregateInventoryMetrics(
      input({
        snapshots: [snapshot("stock", "2026-10-14T08:00:00Z", 10)],
      }),
    );

    expect(result.safetyStockReasonCode).toBe("SAFETY_STOCK_DAYS_UNKNOWN");
    expect(result.reorderPointReasonCode).toBe("LEAD_TIME_UNKNOWN");
    expect(result.targetStockReasonCode).toBe("LEAD_TIME_UNKNOWN");
  });

  it("uses the current and preceding seven-day windows", () => {
    const result = aggregateInventoryMetrics(
      input({
        demand: {
          netUnitsSold: 0,
          salesVelocity30d: 2,
          days: [
            {
              metricDate: "2026-09-30",
              unitsSold: 9,
              returnedUnits: 0,
              eligible: true,
            },
            {
              metricDate: "2026-10-01",
              unitsSold: 1,
              returnedUnits: 0,
              eligible: true,
            },
            {
              metricDate: "2026-10-07",
              unitsSold: 7,
              returnedUnits: 0,
              eligible: true,
            },
            {
              metricDate: "2026-10-08",
              unitsSold: 14,
              returnedUnits: 0,
              eligible: true,
            },
          ],
        },
      }),
    );
    const unknownPrior = aggregateInventoryMetrics(
      input({
        demand: {
          netUnitsSold: 0,
          salesVelocity30d: 2,
          days: [
            {
              metricDate: "2026-10-14",
              unitsSold: 7,
              returnedUnits: 0,
              eligible: true,
            },
          ],
        },
      }),
    );

    expect(result.demandTrend).toBe("rising");
    expect(result.demandTrendReasonCode).toBeNull();
    expect(unknownPrior.demandTrend).toBe("unknown");
    expect(unknownPrior.demandTrendReasonCode).toBe(
      "TREND_INPUT_UNKNOWN",
    );
  });

  it("does not invent incoming quantity, inventory position, or inventory age", () => {
    const result = aggregateInventoryMetrics(
      input({
        snapshots: [snapshot("stock", "2026-10-14T08:00:00Z", 4)],
      }),
    );

    expect(result.eligibleIncomingQuantity).toBeNull();
    expect(result.eligibleIncomingReasonCode).toBe(
      "INCOMING_STATE_UNKNOWN",
    );
    expect(result.inventoryPosition).toBeNull();
    expect(result.inventoryAgeDays).toBeNull();
    expect(result.inventoryAgeQuality).toBe("unavailable");
    expect(result.inventoryAgeReasonCode).toBe("INVENTORY_AGE_UNKNOWN");
  });
});
