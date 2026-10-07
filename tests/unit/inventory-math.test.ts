import { describe, expect, it } from "vitest";

import {
  calculateDaysOfStock,
  calculateSafetyStock,
  calculateSalesVelocity,
} from "@/lib/metrics/inventory-math";

describe("sales-velocity-v1", () => {
  it("calculates net daily sales velocity", () => {
    expect(
      calculateSalesVelocity({
        soldUnits: 100,
        cancelledUnits: 10,
        returnedUnits: 6,
        eligibleDays: 14,
      }),
    ).toEqual({
      value: 6,
      reasonCode: null,
    });
  });

  it("returns known zero demand rather than null", () => {
    expect(
      calculateSalesVelocity({
        soldUnits: 0,
        cancelledUnits: 0,
        returnedUnits: 0,
        eligibleDays: 30,
      }),
    ).toEqual({
      value: 0,
      reasonCode: null,
    });
  });

  it("fails closed when there are no eligible days", () => {
    expect(
      calculateSalesVelocity({
        soldUnits: 20,
        cancelledUnits: 0,
        returnedUnits: 0,
        eligibleDays: 0,
      }),
    ).toEqual({
      value: null,
      reasonCode: "NO_ELIGIBLE_DAYS",
    });
  });

  it("never produces negative net demand", () => {
    expect(
      calculateSalesVelocity({
        soldUnits: 5,
        cancelledUnits: 3,
        returnedUnits: 4,
        eligibleDays: 7,
      }),
    ).toEqual({
      value: 0,
      reasonCode: null,
    });
  });

  it("rejects invalid negative source quantities", () => {
    expect(() =>
      calculateSalesVelocity({
        soldUnits: -1,
        cancelledUnits: 0,
        returnedUnits: 0,
        eligibleDays: 7,
      }),
    ).toThrow(
      "soldUnits must be a non-negative integer.",
    );
  });
});

describe("days-of-stock-v1", () => {
  it("calculates inventory coverage from demand", () => {
    expect(
      calculateDaysOfStock({
        availableQuantity: 30,
        dailyDemand: 3,
      }),
    ).toEqual({
      value: 10,
      reasonCode: null,
    });
  });

  it("returns zero coverage when inventory is known zero", () => {
    expect(
      calculateDaysOfStock({
        availableQuantity: 0,
        dailyDemand: 3,
      }),
    ).toEqual({
      value: 0,
      reasonCode: null,
    });
  });

  it("distinguishes unknown inventory from zero inventory", () => {
    expect(
      calculateDaysOfStock({
        availableQuantity: null,
        dailyDemand: 3,
      }),
    ).toEqual({
      value: null,
      reasonCode: "INVENTORY_UNKNOWN",
    });
  });

  it("does not persist infinity for zero demand", () => {
    expect(
      calculateDaysOfStock({
        availableQuantity: 100,
        dailyDemand: 0,
      }),
    ).toEqual({
      value: null,
      reasonCode: "ZERO_DEMAND",
    });
  });

  it("fails closed for unknown demand", () => {
    expect(
      calculateDaysOfStock({
        availableQuantity: 100,
        dailyDemand: null,
      }),
    ).toEqual({
      value: null,
      reasonCode: "DEMAND_UNKNOWN",
    });
  });
});

describe("safety-stock-v1", () => {
  it("calculates and rounds safety stock upward", () => {
    expect(
      calculateSafetyStock({
        dailyDemand: 2.25,
        safetyStockDays: 3,
      }),
    ).toEqual({
      value: 7,
      reasonCode: null,
    });
  });

  it("supports explicit zero safety-stock days", () => {
    expect(
      calculateSafetyStock({
        dailyDemand: 4,
        safetyStockDays: 0,
      }),
    ).toEqual({
      value: 0,
      reasonCode: null,
    });
  });

  it("fails closed for unknown demand", () => {
    expect(
      calculateSafetyStock({
        dailyDemand: null,
        safetyStockDays: 5,
      }),
    ).toEqual({
      value: null,
      reasonCode: "DEMAND_UNKNOWN",
    });
  });

  it("fails closed for unknown safety-stock configuration", () => {
    expect(
      calculateSafetyStock({
        dailyDemand: 4,
        safetyStockDays: null,
      }),
    ).toEqual({
      value: null,
      reasonCode: "SAFETY_STOCK_DAYS_UNKNOWN",
    });
  });
});

describe("reorder-point-v1", () => {
  it("calculates lead-time demand plus safety stock", async () => {
    const {
      calculateReorderPoint,
    } = await import("@/lib/metrics/inventory-math");

    expect(
      calculateReorderPoint({
        dailyDemand: 3,
        leadTimeDays: 7,
        safetyStockUnits: 6,
      }),
    ).toEqual({
      value: 27,
      reasonCode: null,
    });
  });

  it("rounds reorder point upward to whole units", async () => {
    const {
      calculateReorderPoint,
    } = await import("@/lib/metrics/inventory-math");

    expect(
      calculateReorderPoint({
        dailyDemand: 2.25,
        leadTimeDays: 4,
        safetyStockUnits: 3,
      }),
    ).toEqual({
      value: 12,
      reasonCode: null,
    });
  });

  it("fails closed when lead time is unknown", async () => {
    const {
      calculateReorderPoint,
    } = await import("@/lib/metrics/inventory-math");

    expect(
      calculateReorderPoint({
        dailyDemand: 2,
        leadTimeDays: null,
        safetyStockUnits: 3,
      }),
    ).toEqual({
      value: null,
      reasonCode: "LEAD_TIME_UNKNOWN",
    });
  });
});

describe("target-stock-v1", () => {
  it("calculates replenishment target stock", async () => {
    const {
      calculateTargetStock,
    } = await import("@/lib/metrics/inventory-math");

    expect(
      calculateTargetStock({
        dailyDemand: 3,
        leadTimeDays: 7,
        reviewPeriodDays: 14,
        safetyStockUnits: 6,
      }),
    ).toEqual({
      value: 69,
      reasonCode: null,
    });
  });

  it("fails closed when review period is unknown", async () => {
    const {
      calculateTargetStock,
    } = await import("@/lib/metrics/inventory-math");

    expect(
      calculateTargetStock({
        dailyDemand: 3,
        leadTimeDays: 7,
        reviewPeriodDays: null,
        safetyStockUnits: 6,
      }),
    ).toEqual({
      value: null,
      reasonCode: "REVIEW_PERIOD_UNKNOWN",
    });
  });

  it("rounds fractional target stock upward", async () => {
    const {
      calculateTargetStock,
    } = await import("@/lib/metrics/inventory-math");

    expect(
      calculateTargetStock({
        dailyDemand: 1.25,
        leadTimeDays: 3,
        reviewPeriodDays: 4,
        safetyStockUnits: 2,
      }),
    ).toEqual({
      value: 11,
      reasonCode: null,
    });
  });
});

describe("order-quantity-v1", () => {
  it("subtracts available and valid incoming inventory", async () => {
    const {
      calculateRecommendedOrderQuantity,
    } = await import("@/lib/metrics/inventory-math");

    expect(
      calculateRecommendedOrderQuantity({
        targetStockUnits: 100,
        availableQuantity: 25,
        validIncomingQuantity: 20,
        incomingStateKnown: true,
      }),
    ).toEqual({
      value: 55,
      reasonCode: null,
    });
  });

  it("never returns a negative reorder quantity", async () => {
    const {
      calculateRecommendedOrderQuantity,
    } = await import("@/lib/metrics/inventory-math");

    expect(
      calculateRecommendedOrderQuantity({
        targetStockUnits: 50,
        availableQuantity: 60,
        validIncomingQuantity: 20,
        incomingStateKnown: true,
      }),
    ).toEqual({
      value: 0,
      reasonCode: null,
    });
  });

  it("fails closed when inventory is unknown", async () => {
    const {
      calculateRecommendedOrderQuantity,
    } = await import("@/lib/metrics/inventory-math");

    expect(
      calculateRecommendedOrderQuantity({
        targetStockUnits: 50,
        availableQuantity: null,
        validIncomingQuantity: 0,
        incomingStateKnown: true,
      }),
    ).toEqual({
      value: null,
      reasonCode: "INVENTORY_UNKNOWN",
    });
  });

  it("fails closed when incoming stock state is unknown", async () => {
    const {
      calculateRecommendedOrderQuantity,
    } = await import("@/lib/metrics/inventory-math");

    expect(
      calculateRecommendedOrderQuantity({
        targetStockUnits: 50,
        availableQuantity: 20,
        validIncomingQuantity: null,
        incomingStateKnown: false,
      }),
    ).toEqual({
      value: null,
      reasonCode: "INCOMING_STATE_UNKNOWN",
    });
  });

  it("uses zero incoming only when zero state is known", async () => {
    const {
      calculateRecommendedOrderQuantity,
    } = await import("@/lib/metrics/inventory-math");

    expect(
      calculateRecommendedOrderQuantity({
        targetStockUnits: 50,
        availableQuantity: 20,
        validIncomingQuantity: null,
        incomingStateKnown: true,
      }),
    ).toEqual({
      value: 30,
      reasonCode: null,
    });
  });

  it("fails closed when target stock is unavailable", async () => {
    const {
      calculateRecommendedOrderQuantity,
    } = await import("@/lib/metrics/inventory-math");

    expect(
      calculateRecommendedOrderQuantity({
        targetStockUnits: null,
        availableQuantity: 20,
        validIncomingQuantity: 0,
        incomingStateKnown: true,
      }),
    ).toEqual({
      value: null,
      reasonCode: "TARGET_STOCK_UNKNOWN",
    });
  });
});

describe("sell-through-v1", () => {
  it("calculates sell-through as a decimal ratio", async () => {
    const { calculateSellThrough } =
      await import("@/lib/metrics/inventory-math");

    expect(
      calculateSellThrough({
        unitsSold: 40,
        unitsAvailableForSale: 100,
      }),
    ).toEqual({
      value: 0.4,
      reasonCode: null,
    });
  });

  it("supports known zero sales", async () => {
    const { calculateSellThrough } =
      await import("@/lib/metrics/inventory-math");

    expect(
      calculateSellThrough({
        unitsSold: 0,
        unitsAvailableForSale: 100,
      }),
    ).toEqual({
      value: 0,
      reasonCode: null,
    });
  });

  it("returns null when denominator is zero", async () => {
    const { calculateSellThrough } =
      await import("@/lib/metrics/inventory-math");

    expect(
      calculateSellThrough({
        unitsSold: 0,
        unitsAvailableForSale: 0,
      }),
    ).toEqual({
      value: null,
      reasonCode: "SELL_THROUGH_DENOMINATOR_ZERO",
    });
  });

  it("rejects impossible sell-through above 100 percent", async () => {
    const { calculateSellThrough } =
      await import("@/lib/metrics/inventory-math");

    expect(() =>
      calculateSellThrough({
        unitsSold: 101,
        unitsAvailableForSale: 100,
      }),
    ).toThrow(
      "unitsSold cannot exceed unitsAvailableForSale.",
    );
  });
});

describe("inventory-age-v1", () => {
  it("prefers exact receipt-history age", async () => {
    const { calculateInventoryAge } =
      await import("@/lib/metrics/inventory-math");

    expect(
      calculateInventoryAge({
        exactAgeDays: 45,
        estimatedAgeDays: 60,
      }),
    ).toEqual({
      value: 45,
      quality: "exact",
      reasonCode: null,
    });
  });

  it("uses documented estimate when exact history is unavailable", async () => {
    const { calculateInventoryAge } =
      await import("@/lib/metrics/inventory-math");

    expect(
      calculateInventoryAge({
        exactAgeDays: null,
        estimatedAgeDays: 60,
      }),
    ).toEqual({
      value: 60,
      quality: "estimated",
      reasonCode: null,
    });
  });

  it("reports unavailable rather than inventing age", async () => {
    const { calculateInventoryAge } =
      await import("@/lib/metrics/inventory-math");

    expect(
      calculateInventoryAge({
        exactAgeDays: null,
        estimatedAgeDays: null,
      }),
    ).toEqual({
      value: null,
      quality: "unavailable",
      reasonCode: "INVENTORY_AGE_UNKNOWN",
    });
  });

  it("rejects negative inventory age", async () => {
    const { calculateInventoryAge } =
      await import("@/lib/metrics/inventory-math");

    expect(() =>
      calculateInventoryAge({
        exactAgeDays: -1,
        estimatedAgeDays: null,
      }),
    ).toThrow(
      "exactAgeDays must be a non-negative integer.",
    );
  });
});

describe("demand-trend-v1", () => {
  it("classifies demand above the stable band as rising", async () => {
    const { calculateDemandTrend } =
      await import("@/lib/metrics/inventory-math");

    expect(
      calculateDemandTrend({
        recentDailyDemand: 12,
        priorDailyDemand: 10,
      }).value,
    ).toBe("rising");
  });

  it("classifies demand below the stable band as falling", async () => {
    const { calculateDemandTrend } =
      await import("@/lib/metrics/inventory-math");

    expect(
      calculateDemandTrend({
        recentDailyDemand: 8,
        priorDailyDemand: 10,
      }).value,
    ).toBe("falling");
  });

  it("classifies small changes as stable", async () => {
    const { calculateDemandTrend } =
      await import("@/lib/metrics/inventory-math");

    expect(
      calculateDemandTrend({
        recentDailyDemand: 10.5,
        priorDailyDemand: 10,
      }).value,
    ).toBe("stable");
  });

  it("classifies zero-to-zero demand as stable", async () => {
    const { calculateDemandTrend } =
      await import("@/lib/metrics/inventory-math");

    expect(
      calculateDemandTrend({
        recentDailyDemand: 0,
        priorDailyDemand: 0,
      }),
    ).toEqual({
      value: "stable",
      changeRatio: 0,
      reasonCode: null,
    });
  });

  it("classifies demand emerging from zero as rising", async () => {
    const { calculateDemandTrend } =
      await import("@/lib/metrics/inventory-math");

    expect(
      calculateDemandTrend({
        recentDailyDemand: 2,
        priorDailyDemand: 0,
      }),
    ).toEqual({
      value: "rising",
      changeRatio: null,
      reasonCode: null,
    });
  });

  it("fails closed when comparison demand is unknown", async () => {
    const { calculateDemandTrend } =
      await import("@/lib/metrics/inventory-math");

    expect(
      calculateDemandTrend({
        recentDailyDemand: 10,
        priorDailyDemand: null,
      }),
    ).toEqual({
      value: null,
      changeRatio: null,
      reasonCode: "TREND_INPUT_UNKNOWN",
    });
  });
});

describe("stockout-risk-v1", () => {
  it("classifies coverage inside lead time as high risk", async () => {
    const { calculateStockoutRisk } =
      await import("@/lib/metrics/inventory-math");

    expect(
      calculateStockoutRisk({
        daysOfStock: 5,
        leadTimeDays: 7,
        safetyStockDays: 3,
      }).value,
    ).toBe("high");
  });

  it("classifies coverage inside safety horizon as medium risk", async () => {
    const { calculateStockoutRisk } =
      await import("@/lib/metrics/inventory-math");

    expect(
      calculateStockoutRisk({
        daysOfStock: 9,
        leadTimeDays: 7,
        safetyStockDays: 3,
      }),
    ).toEqual({
      value: "medium",
      coverageDays: 9,
      replenishmentHorizonDays: 10,
      reasonCode: null,
    });
  });

  it("classifies coverage beyond replenishment horizon as low risk", async () => {
    const { calculateStockoutRisk } =
      await import("@/lib/metrics/inventory-math");

    expect(
      calculateStockoutRisk({
        daysOfStock: 20,
        leadTimeDays: 7,
        safetyStockDays: 3,
      }).value,
    ).toBe("low");
  });

  it("fails closed when stock coverage is unknown", async () => {
    const { calculateStockoutRisk } =
      await import("@/lib/metrics/inventory-math");

    expect(
      calculateStockoutRisk({
        daysOfStock: null,
        leadTimeDays: 7,
        safetyStockDays: 3,
      }),
    ).toEqual({
      value: null,
      coverageDays: null,
      replenishmentHorizonDays: null,
      reasonCode: "STOCK_COVERAGE_UNKNOWN",
    });
  });

  it("fails closed when lead time is unknown", async () => {
    const { calculateStockoutRisk } =
      await import("@/lib/metrics/inventory-math");

    expect(
      calculateStockoutRisk({
        daysOfStock: 10,
        leadTimeDays: null,
        safetyStockDays: 3,
      }).reasonCode,
    ).toBe("LEAD_TIME_UNKNOWN");
  });
});

describe("overstock-risk-v1", () => {
  it("classifies inventory at or below target as low risk", async () => {
    const { calculateOverstockRisk } =
      await import("@/lib/metrics/inventory-math");

    expect(
      calculateOverstockRisk({
        availableQuantity: 80,
        validIncomingQuantity: 10,
        incomingStateKnown: true,
        targetStockUnits: 100,
      }).value,
    ).toBe("low");
  });

  it("classifies moderate excess inventory as medium risk", async () => {
    const { calculateOverstockRisk } =
      await import("@/lib/metrics/inventory-math");

    expect(
      calculateOverstockRisk({
        availableQuantity: 110,
        validIncomingQuantity: 20,
        incomingStateKnown: true,
        targetStockUnits: 100,
      }),
    ).toEqual({
      value: "medium",
      inventoryPositionUnits: 130,
      targetStockUnits: 100,
      positionToTargetRatio: 1.3,
      reasonCode: null,
    });
  });

  it("classifies inventory above 1.5 times target as high risk", async () => {
    const { calculateOverstockRisk } =
      await import("@/lib/metrics/inventory-math");

    expect(
      calculateOverstockRisk({
        availableQuantity: 160,
        validIncomingQuantity: 0,
        incomingStateKnown: true,
        targetStockUnits: 100,
      }).value,
    ).toBe("high");
  });

  it("fails closed when incoming state is unknown", async () => {
    const { calculateOverstockRisk } =
      await import("@/lib/metrics/inventory-math");

    expect(
      calculateOverstockRisk({
        availableQuantity: 100,
        validIncomingQuantity: null,
        incomingStateKnown: false,
        targetStockUnits: 100,
      }).reasonCode,
    ).toBe("INCOMING_STATE_UNKNOWN");
  });

  it("handles zero target without division by zero", async () => {
    const { calculateOverstockRisk } =
      await import("@/lib/metrics/inventory-math");

    expect(
      calculateOverstockRisk({
        availableQuantity: 10,
        validIncomingQuantity: 0,
        incomingStateKnown: true,
        targetStockUnits: 0,
      }),
    ).toEqual({
      value: "high",
      inventoryPositionUnits: 10,
      targetStockUnits: 0,
      positionToTargetRatio: null,
      reasonCode: null,
    });
  });
});

describe("supplier-order-constraints-v1", () => {
  it("keeps zero need at zero even when MOQ exists", async () => {
    const { applySupplierOrderConstraints } =
      await import("@/lib/metrics/inventory-math");

    expect(
      applySupplierOrderConstraints({
        requiredQuantity: 0,
        minimumOrderQuantity: 12,
        packSize: 6,
      }),
    ).toEqual({
      requiredQuantity: 0,
      constrainedQuantity: 0,
      minimumOrderQuantity: 12,
      packSize: 6,
      minimumApplied: false,
      packRoundingApplied: false,
    });
  });

  it("applies MOQ when positive need is below minimum", async () => {
    const { applySupplierOrderConstraints } =
      await import("@/lib/metrics/inventory-math");

    expect(
      applySupplierOrderConstraints({
        requiredQuantity: 5,
        minimumOrderQuantity: 12,
        packSize: null,
      }),
    ).toEqual({
      requiredQuantity: 5,
      constrainedQuantity: 12,
      minimumOrderQuantity: 12,
      packSize: null,
      minimumApplied: true,
      packRoundingApplied: false,
    });
  });

  it("rounds upward to a valid pack multiple", async () => {
    const { applySupplierOrderConstraints } =
      await import("@/lib/metrics/inventory-math");

    expect(
      applySupplierOrderConstraints({
        requiredQuantity: 25,
        minimumOrderQuantity: null,
        packSize: 6,
      }),
    ).toEqual({
      requiredQuantity: 25,
      constrainedQuantity: 30,
      minimumOrderQuantity: null,
      packSize: 6,
      minimumApplied: false,
      packRoundingApplied: true,
    });
  });

  it("applies MOQ before pack-size rounding", async () => {
    const { applySupplierOrderConstraints } =
      await import("@/lib/metrics/inventory-math");

    expect(
      applySupplierOrderConstraints({
        requiredQuantity: 13,
        minimumOrderQuantity: 12,
        packSize: 6,
      }),
    ).toEqual({
      requiredQuantity: 13,
      constrainedQuantity: 18,
      minimumOrderQuantity: 12,
      packSize: 6,
      minimumApplied: false,
      packRoundingApplied: true,
    });
  });

  it("keeps a quantity already valid for both constraints", async () => {
    const { applySupplierOrderConstraints } =
      await import("@/lib/metrics/inventory-math");

    expect(
      applySupplierOrderConstraints({
        requiredQuantity: 24,
        minimumOrderQuantity: 12,
        packSize: 6,
      }),
    ).toEqual({
      requiredQuantity: 24,
      constrainedQuantity: 24,
      minimumOrderQuantity: 12,
      packSize: 6,
      minimumApplied: false,
      packRoundingApplied: false,
    });
  });

  it("rejects zero MOQ", async () => {
    const { applySupplierOrderConstraints } =
      await import("@/lib/metrics/inventory-math");

    expect(() =>
      applySupplierOrderConstraints({
        requiredQuantity: 10,
        minimumOrderQuantity: 0,
        packSize: null,
      }),
    ).toThrow(
      "minimumOrderQuantity must be a positive integer.",
    );
  });

  it("rejects invalid pack size", async () => {
    const { applySupplierOrderConstraints } =
      await import("@/lib/metrics/inventory-math");

    expect(() =>
      applySupplierOrderConstraints({
        requiredQuantity: 10,
        minimumOrderQuantity: null,
        packSize: -2,
      }),
    ).toThrow(
      "packSize must be a positive integer.",
    );
  });
});

describe("incoming-stock-v1", () => {
  it("does not count draft purchase orders as valid incoming", async () => {
    const { calculateValidIncomingPurchaseOrderLine } =
      await import("@/lib/metrics/inventory-math");

    expect(
      calculateValidIncomingPurchaseOrderLine({
        status: "draft",
        orderedQuantity: 100,
        receivedQuantity: null,
      }),
    ).toEqual({
      validIncomingQuantity: 0,
      incomingStateKnown: true,
      reasonCode: null,
    });
  });

  it("counts submitted purchase orders as incoming", async () => {
    const { calculateValidIncomingPurchaseOrderLine } =
      await import("@/lib/metrics/inventory-math");

    expect(
      calculateValidIncomingPurchaseOrderLine({
        status: "submitted",
        orderedQuantity: 100,
        receivedQuantity: null,
      }),
    ).toEqual({
      validIncomingQuantity: 100,
      incomingStateKnown: true,
      reasonCode: null,
    });
  });

  it("counts confirmed purchase orders as incoming", async () => {
    const { calculateValidIncomingPurchaseOrderLine } =
      await import("@/lib/metrics/inventory-math");

    expect(
      calculateValidIncomingPurchaseOrderLine({
        status: "confirmed",
        orderedQuantity: 50,
        receivedQuantity: null,
      }),
    ).toEqual({
      validIncomingQuantity: 50,
      incomingStateKnown: true,
      reasonCode: null,
    });
  });

  it("counts only remaining quantity for partially received orders", async () => {
    const { calculateValidIncomingPurchaseOrderLine } =
      await import("@/lib/metrics/inventory-math");

    expect(
      calculateValidIncomingPurchaseOrderLine({
        status: "partially_received",
        orderedQuantity: 100,
        receivedQuantity: 40,
      }),
    ).toEqual({
      validIncomingQuantity: 60,
      incomingStateKnown: true,
      reasonCode: null,
    });
  });

  it("fails closed when partial receipt quantity is unknown", async () => {
    const { calculateValidIncomingPurchaseOrderLine } =
      await import("@/lib/metrics/inventory-math");

    expect(
      calculateValidIncomingPurchaseOrderLine({
        status: "partially_received",
        orderedQuantity: 100,
        receivedQuantity: null,
      }),
    ).toEqual({
      validIncomingQuantity: null,
      incomingStateKnown: false,
      reasonCode: "RECEIVED_QUANTITY_UNKNOWN",
    });
  });

  it("treats fully received purchase orders as zero incoming", async () => {
    const { calculateValidIncomingPurchaseOrderLine } =
      await import("@/lib/metrics/inventory-math");

    expect(
      calculateValidIncomingPurchaseOrderLine({
        status: "received",
        orderedQuantity: 100,
        receivedQuantity: 100,
      }).validIncomingQuantity,
    ).toBe(0);
  });

  it("treats cancelled purchase orders as zero incoming", async () => {
    const { calculateValidIncomingPurchaseOrderLine } =
      await import("@/lib/metrics/inventory-math");

    expect(
      calculateValidIncomingPurchaseOrderLine({
        status: "cancelled",
        orderedQuantity: 100,
        receivedQuantity: null,
      }).validIncomingQuantity,
    ).toBe(0);
  });

  it("fails closed for unknown purchase-order status", async () => {
    const { calculateValidIncomingPurchaseOrderLine } =
      await import("@/lib/metrics/inventory-math");

    expect(
      calculateValidIncomingPurchaseOrderLine({
        status: "unknown",
        orderedQuantity: 100,
        receivedQuantity: null,
      }),
    ).toEqual({
      validIncomingQuantity: null,
      incomingStateKnown: false,
      reasonCode: "PURCHASE_ORDER_STATUS_UNKNOWN",
    });
  });

  it("does not create negative incoming from over-receipt", async () => {
    const { calculateValidIncomingPurchaseOrderLine } =
      await import("@/lib/metrics/inventory-math");

    expect(
      calculateValidIncomingPurchaseOrderLine({
        status: "partially_received",
        orderedQuantity: 100,
        receivedQuantity: 110,
      }),
    ).toEqual({
      validIncomingQuantity: null,
      incomingStateKnown: false,
      reasonCode: "RECEIVED_EXCEEDS_ORDERED",
    });
  });

  it("aggregates valid incoming across multiple purchase-order lines", async () => {
    const { calculateValidIncomingPurchaseOrders } =
      await import("@/lib/metrics/inventory-math");

    expect(
      calculateValidIncomingPurchaseOrders([
        {
          status: "confirmed",
          orderedQuantity: 40,
          receivedQuantity: null,
        },
        {
          status: "partially_received",
          orderedQuantity: 50,
          receivedQuantity: 20,
        },
        {
          status: "cancelled",
          orderedQuantity: 100,
          receivedQuantity: null,
        },
      ]),
    ).toEqual({
      validIncomingQuantity: 70,
      incomingStateKnown: true,
      reasonCode: null,
    });
  });

  it("fails the aggregate closed when any line is ambiguous", async () => {
    const { calculateValidIncomingPurchaseOrders } =
      await import("@/lib/metrics/inventory-math");

    expect(
      calculateValidIncomingPurchaseOrders([
        {
          status: "confirmed",
          orderedQuantity: 40,
          receivedQuantity: null,
        },
        {
          status: "unknown",
          orderedQuantity: 30,
          receivedQuantity: null,
        },
      ]),
    ).toEqual({
      validIncomingQuantity: null,
      incomingStateKnown: false,
      reasonCode: "PURCHASE_ORDER_STATUS_UNKNOWN",
    });
  });

  it("returns known zero when there are no incoming lines", async () => {
    const { calculateValidIncomingPurchaseOrders } =
      await import("@/lib/metrics/inventory-math");

    expect(
      calculateValidIncomingPurchaseOrders([]),
    ).toEqual({
      validIncomingQuantity: 0,
      incomingStateKnown: true,
      reasonCode: null,
    });
  });
});
