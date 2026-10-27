import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createMetricRolloverQueue,
  isAuthorizedMetricRolloverRequest,
  METRIC_ROLLOVER_MIN_SECRET_LENGTH,
  readMetricRolloverWorkerConfig,
  type MetricRolloverRpcClient,
} from "@/lib/persistence/metric-rollover";

function clientWith(
  data: unknown,
  error: { code?: string; message: string } | null = null,
): MetricRolloverRpcClient {
  return {
    rpc: vi.fn(async () => ({ data, error })),
  };
}

describe("M5.6D metric rollover queue wrapper", () => {
  it("parses enqueue counts from the security-definer RPC", async () => {
    const client = clientWith({
      storesSelected: 2,
      runsOpened: 1,
      runsResumed: 1,
      runsCompleted: 0,
      runsFailed: 0,
      grainsEnrolled: 40,
    });
    const queue = createMetricRolloverQueue(client);

    await expect(
      queue.enqueue({
        limit: 100,
        maxStores: 4,
        organizationId: null,
        asOf: "2026-03-08T12:00:00.000Z",
      }),
    ).resolves.toEqual({
      storesSelected: 2,
      runsOpened: 1,
      runsResumed: 1,
      runsCompleted: 0,
      runsFailed: 0,
      grainsEnrolled: 40,
    });

    expect(client.rpc).toHaveBeenCalledWith(
      "enqueue_sku_daily_metric_daily_rollover",
      {
        p_limit: 100,
        p_max_stores: 4,
        p_organization_id: null,
        p_as_of: "2026-03-08T12:00:00.000Z",
      },
    );
  });

  it("fails closed when the worker secret is too short", () => {
    const config = readMetricRolloverWorkerConfig({
      METRIC_ROLLOVER_WORKER_ENABLED: "1",
      METRIC_ROLLOVER_WORKER_SECRET: "short",
    });

    expect(config.enabled).toBe(true);
    expect(config.secret).toBeNull();
    expect(METRIC_ROLLOVER_MIN_SECRET_LENGTH).toBe(32);
  });

  it("compares bearer secrets in constant time", () => {
    const secret = "a".repeat(32);

    expect(
      isAuthorizedMetricRolloverRequest(`Bearer ${secret}`, secret),
    ).toBe(true);
    expect(
      isAuthorizedMetricRolloverRequest(`Bearer ${"b".repeat(32)}`, secret),
    ).toBe(false);
    expect(
      isAuthorizedMetricRolloverRequest(null, secret),
    ).toBe(false);
  });

  it("requires an exact enablement flag of 1", () => {
    expect(
      readMetricRolloverWorkerConfig({
        METRIC_ROLLOVER_WORKER_ENABLED: "true",
        METRIC_ROLLOVER_WORKER_SECRET: "a".repeat(32),
      }).enabled,
    ).toBe(false);
  });
});
