import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  recomputeSkuDailyMetric,
  SkuDailyMetricSourceChangedError,
} from "@/lib/persistence/recompute-sku-daily-metric";

const INPUT = {
  organizationId: "org",
  storeId: "store",
  locationId: "loc",
  variantId: "variant",
  metricDate: "2026-10-14",
};

function snapshot(token: string, timeZone = "UTC") {
  return {
    timeZone,
    sourceToken: token,
    orders: [],
    orderItems: [],
    returnRefunds: [],
    inventorySnapshots: [],
  };
}

function planningSettings(
  value: {
    leadTimeDays: number | null;
    safetyStockDays: number | null;
    reviewPeriodDays: number | null;
  } = {
    leadTimeDays: null,
    safetyStockDays: null,
    reviewPeriodDays: null,
  },
) {
  return value;
}

describe("M5.5 recompute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retries once after a source-token mismatch and commits the fresh token", async () => {
    const tokens = ["stale", "fresh"];
    const rpc = vi.fn(
      async (fn: string, args: Record<string, unknown>) => {
        if (fn === "sku_daily_metric_organization_planning_settings") {
          return {
            data: planningSettings(),
            error: null,
          };
        }

        if (fn === "sku_daily_metric_source_snapshot") {
          return {
            data: snapshot(tokens.shift() ?? "fresh"),
            error: null,
          };
        }

        if (args.p_source_token === "stale") {
          return {
            data: null,
            error: {
              code: "SA008",
              message: "sku daily metric source token mismatch",
            },
          };
        }

        return {
          data: "metric-id",
          error: null,
        };
      },
    );

    await expect(
      recomputeSkuDailyMetric(INPUT, { rpc }),
    ).resolves.toBe("metric-id");
    expect(rpc).toHaveBeenCalledWith(
      "sku_daily_metric_organization_planning_settings",
      { p_organization_id: INPUT.organizationId },
    );
    expect(rpc).toHaveBeenCalledTimes(5);
  });

  it("fails closed after repeated source-token mismatches", async () => {
    const rpc = vi.fn(async (fn: string) => {
      if (fn === "sku_daily_metric_organization_planning_settings") {
        return {
          data: planningSettings(),
          error: null,
        };
      }

      if (fn === "sku_daily_metric_source_snapshot") {
        return {
          data: snapshot("moving"),
          error: null,
        };
      }

      return {
        data: null,
        error: {
          code: "SA008",
          message: "sku daily metric source token mismatch",
        },
      };
    });

    await expect(
      recomputeSkuDailyMetric(INPUT, { rpc }),
    ).rejects.toBeInstanceOf(SkuDailyMetricSourceChangedError);
  });

  it("does not commit when the store timezone is unrecognized", async () => {
    const rpc = vi.fn(async (fn: string) => {
      if (fn === "sku_daily_metric_organization_planning_settings") {
        return {
          data: planningSettings(),
          error: null,
        };
      }

      return {
        data: snapshot("token", "EST"),
        error: null,
      };
    });

    await expect(
      recomputeSkuDailyMetric(INPUT, { rpc }),
    ).rejects.toThrow(
      "stores.timezone must be a recognized IANA timezone.",
    );
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("binds organization planning defaults into threshold aggregation", async () => {
    const committed: { metric: Record<string, unknown> | null } = {
      metric: null,
    };
    const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
      if (fn === "sku_daily_metric_organization_planning_settings") {
        return {
          data: planningSettings({
            leadTimeDays: 7,
            safetyStockDays: 3,
            reviewPeriodDays: 14,
          }),
          error: null,
        };
      }

      if (fn === "sku_daily_metric_source_snapshot") {
        return {
          data: {
            ...snapshot("token"),
            inventorySnapshots: [
              {
                id: "snap-1",
                organizationId: INPUT.organizationId,
                storeId: INPUT.storeId,
                locationId: INPUT.locationId,
                variantId: INPUT.variantId,
                observedAt: "2026-10-14T23:00:00.000Z",
                availableQuantity: 100,
              },
            ],
          },
          error: null,
        };
      }

      committed.metric = args.p_metric as Record<string, unknown>;
      return {
        data: "metric-id",
        error: null,
      };
    });

    await expect(
      recomputeSkuDailyMetric(INPUT, { rpc }),
    ).resolves.toBe("metric-id");

    const metric = committed.metric;
    expect(metric).not.toBeNull();
    expect(metric?.eligibleIncomingQuantity).toBeNull();
    expect(metric?.eligibleIncomingReasonCode).toBe(
      "incoming_state_unknown",
    );
    // Known-zero demand with known planning days → numeric thresholds.
    expect(metric?.safetyStock).toBe(0);
    expect(metric?.reorderPoint).toBe(0);
    expect(metric?.targetStock).toBe(0);
    expect(metric?.safetyStockReasonCode).toBeNull();
    expect(metric?.reorderPointReasonCode).toBeNull();
    expect(metric?.targetStockReasonCode).toBeNull();
  });

  it("preserves null planning as unknown threshold reason codes", async () => {
    const committed: { metric: Record<string, unknown> | null } = {
      metric: null,
    };
    const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
      if (fn === "sku_daily_metric_organization_planning_settings") {
        return {
          data: planningSettings({
            leadTimeDays: null,
            safetyStockDays: null,
            reviewPeriodDays: null,
          }),
          error: null,
        };
      }

      if (fn === "sku_daily_metric_source_snapshot") {
        return {
          data: {
            ...snapshot("token"),
            inventorySnapshots: [
              {
                id: "snap-1",
                organizationId: INPUT.organizationId,
                storeId: INPUT.storeId,
                locationId: INPUT.locationId,
                variantId: INPUT.variantId,
                observedAt: "2026-10-14T23:00:00.000Z",
                availableQuantity: 100,
              },
            ],
          },
          error: null,
        };
      }

      committed.metric = args.p_metric as Record<string, unknown>;
      return {
        data: "metric-id",
        error: null,
      };
    });

    await expect(
      recomputeSkuDailyMetric(INPUT, { rpc }),
    ).resolves.toBe("metric-id");

    const metric = committed.metric;
    expect(metric?.safetyStock).toBeNull();
    expect(metric?.reorderPoint).toBeNull();
    expect(metric?.targetStock).toBeNull();
    expect(metric?.safetyStockReasonCode).toBe(
      "safety_stock_days_unknown",
    );
    expect(metric?.reorderPointReasonCode).toBe("lead_time_unknown");
    // Target checks lead time before review period when both are null.
    expect(metric?.targetStockReasonCode).toBe("lead_time_unknown");
    expect(metric?.eligibleIncomingQuantity).toBeNull();
  });

  it("treats explicit planning zero as known zero, not unknown", async () => {
    const committed: { metric: Record<string, unknown> | null } = {
      metric: null,
    };
    const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
      if (fn === "sku_daily_metric_organization_planning_settings") {
        return {
          data: planningSettings({
            leadTimeDays: 0,
            safetyStockDays: 0,
            reviewPeriodDays: 0,
          }),
          error: null,
        };
      }

      if (fn === "sku_daily_metric_source_snapshot") {
        return {
          data: {
            ...snapshot("token"),
            inventorySnapshots: [
              {
                id: "snap-1",
                organizationId: INPUT.organizationId,
                storeId: INPUT.storeId,
                locationId: INPUT.locationId,
                variantId: INPUT.variantId,
                observedAt: "2026-10-14T23:00:00.000Z",
                availableQuantity: 100,
              },
            ],
          },
          error: null,
        };
      }

      committed.metric = args.p_metric as Record<string, unknown>;
      return {
        data: "metric-id",
        error: null,
      };
    });

    await expect(
      recomputeSkuDailyMetric(INPUT, { rpc }),
    ).resolves.toBe("metric-id");

    const metric = committed.metric;
    expect(metric?.safetyStock).toBe(0);
    expect(metric?.reorderPoint).toBe(0);
    expect(metric?.targetStock).toBe(0);
    expect(metric?.safetyStockReasonCode).toBeNull();
    expect(metric?.reorderPointReasonCode).toBeNull();
    expect(metric?.targetStockReasonCode).toBeNull();
  });
});
