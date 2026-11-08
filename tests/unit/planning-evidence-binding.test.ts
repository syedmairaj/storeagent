import { describe, expect, it } from "vitest";

import { aggregateInventoryMetrics } from "@/lib/metrics/inventory-aggregates";
import { toInventoryPlanningSettings } from "@/lib/planning-inputs/to-inventory-planning-settings";

describe("planning evidence binding helpers", () => {
  it("preserves null unknown and numeric zero", () => {
    expect(toInventoryPlanningSettings(null)).toEqual({
      leadTimeDays: null,
      safetyStockDays: null,
      reviewPeriodDays: null,
    });
    expect(
      toInventoryPlanningSettings({
        leadTimeDays: 0,
        safetyStockDays: null,
        reviewPeriodDays: 14,
      }),
    ).toEqual({
      leadTimeDays: 0,
      safetyStockDays: null,
      reviewPeriodDays: 14,
    });
    expect(
      toInventoryPlanningSettings({
        lead_time_days: 7,
        safety_stock_days: 3,
        review_period_days: 0,
      }),
    ).toEqual({
      leadTimeDays: 7,
      safetyStockDays: 3,
      reviewPeriodDays: 0,
    });
  });

  it("rejects non-integer planning days", () => {
    expect(() =>
      toInventoryPlanningSettings({
        leadTimeDays: 1.5,
        safetyStockDays: 1,
        reviewPeriodDays: 1,
      }),
    ).toThrow(/non-negative integer/);
  });

  it("does not invent thresholds when demand is missing", () => {
    const result = aggregateInventoryMetrics({
      organizationId: "org",
      storeId: "store",
      locationId: "loc",
      variantId: "variant",
      metricDate: "2026-10-14",
      timeZone: "UTC",
      snapshots: [],
      demand: {
        netUnitsSold: 0,
        salesVelocity30d: null,
        days: [],
      },
      planning: {
        leadTimeDays: 7,
        safetyStockDays: 3,
        reviewPeriodDays: 14,
      },
    });

    expect(result.safetyStock).toBeNull();
    expect(result.safetyStockReasonCode).toBe("DEMAND_UNKNOWN");
    expect(result.reorderPoint).toBeNull();
    expect(result.targetStock).toBeNull();
    expect(result.eligibleIncomingQuantity).toBeNull();
    expect(result.eligibleIncomingReasonCode).toBe("INCOMING_STATE_UNKNOWN");
  });

  it("computes frozen threshold formulas from org planning defaults", () => {
    const result = aggregateInventoryMetrics({
      organizationId: "org",
      storeId: "store",
      locationId: "loc",
      variantId: "variant",
      metricDate: "2026-10-14",
      timeZone: "UTC",
      snapshots: [
        {
          id: "snap",
          organizationId: "org",
          storeId: "store",
          locationId: "loc",
          variantId: "variant",
          observedAt: "2026-10-14T12:00:00.000Z",
          availableQuantity: 50,
        },
      ],
      demand: {
        netUnitsSold: 0,
        salesVelocity30d: 2,
        days: [],
      },
      planning: {
        leadTimeDays: 7,
        safetyStockDays: 3,
        reviewPeriodDays: 14,
      },
    });

    // safety = ceil(2*3)=6; ROP=ceil(2*7+6)=20; target=ceil(2*(7+14)+6)=48
    expect(result.safetyStock).toBe(6);
    expect(result.reorderPoint).toBe(20);
    expect(result.targetStock).toBe(48);
    expect(result.eligibleIncomingQuantity).toBeNull();
  });
});
