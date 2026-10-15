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

describe("M5.5 recompute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retries once after a source-token mismatch and commits the fresh token", async () => {
    const tokens = ["stale", "fresh"];
    const rpc = vi.fn(
      async (fn: string, args: Record<string, unknown>) => {
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
    expect(rpc).toHaveBeenCalledTimes(4);
  });

  it("fails closed after repeated source-token mismatches", async () => {
    const rpc = vi.fn(async (fn: string) => {
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
    const rpc = vi.fn(async () => ({
      data: snapshot("token", "EST"),
      error: null,
    }));

    await expect(
      recomputeSkuDailyMetric(INPUT, { rpc }),
    ).rejects.toThrow(
      "stores.timezone must be a recognized IANA timezone.",
    );
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
