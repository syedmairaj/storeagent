import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  M56E4_CANARY_APPROVAL_PHRASE,
  runM56E4SingleGrainCanaryRecompute,
} from "@/lib/canary/m5-6e4-single-grain-recompute";

import type {
  ClaimedMetricRecompute,
  MetricRecomputeQueue,
  MetricRecomputeRpcClient,
} from "@/lib/persistence/metric-recompute-queue";

const ORG = "e46e4000-0000-4000-8000-000000000001";
const OTHER = "e46e4000-0000-4000-8000-000000000099";

const claim: ClaimedMetricRecompute = {
  organizationId: ORG,
  storeId: "e46e4000-0000-4000-8000-000000000002",
  locationId: "e46e4000-0000-4000-8000-000000000003",
  variantId: "e46e4000-0000-4000-8000-000000000005",
  metricDate: "2026-06-15",
  algorithmVersion: "m5-derived-metrics-v1",
  ownerId: "m56e4-canary:test",
  claimToken: "token-1",
  claimedGeneration: 1,
  attemptCount: 0,
  leaseExpiresAt: "2026-06-15T12:02:00+00:00",
};

const expectedGrain = {
  storeId: claim.storeId,
  locationId: claim.locationId,
  variantId: claim.variantId,
  metricDate: claim.metricDate,
};

function baseInput(
  queue: MetricRecomputeQueue,
  client: MetricRecomputeRpcClient,
  overrides: Record<string, unknown> = {},
) {
  return {
    approval: M56E4_CANARY_APPROVAL_PHRASE,
    expectedOrganizationId: ORG,
    expectedGrain,
    expectedOwnerId: claim.ownerId,
    expectedClaimToken: claim.claimToken,
    expectedClaimedGeneration: claim.claimedGeneration,
    claim,
    queue,
    client,
    ...overrides,
  };
}

function queueMock(
  overrides: Partial<MetricRecomputeQueue> = {},
): MetricRecomputeQueue {
  return {
    consume: vi.fn(),
    recover: vi.fn(),
    claim: vi.fn(),
    start: vi.fn(async () => ({
      attemptCount: 1,
      claimedGeneration: 1,
      leaseExpiresAt: claim.leaseExpiresAt,
    })),
    complete: vi.fn(async () => "succeeded" as const),
    fail: vi.fn(),
    stats: vi.fn(),
    ...overrides,
  };
}

const client: MetricRecomputeRpcClient = {
  rpc(fn) {
    if (fn === "sku_daily_metric_source_snapshot") {
      return Promise.resolve({
        data: {
          timeZone: "UTC",
          sourceToken: "tok",
          orders: [],
          orderItems: [],
          returnRefunds: [],
          inventorySnapshots: [
            {
              observedAt: "2026-06-15T12:00:00.000Z",
              availableQuantity: 7,
              onHandQuantity: null,
              committedQuantity: null,
              incomingQuantity: null,
            },
          ],
        },
        error: null,
        status: 200,
      });
    }

    if (fn === "commit_sku_daily_metric") {
      return Promise.resolve({
        data: "metric-row-id",
        error: null,
        status: 200,
      });
    }

    return Promise.resolve({
      data: null,
      error: { message: `unexpected ${fn}` },
      status: 500,
    });
  },
};

describe("M5.6E.4 single-grain canary recompute runner", () => {
  it("fails closed on approval, org, grain, owner, token, and generation mismatches", async () => {
    const queue = queueMock();

    await expect(
      runM56E4SingleGrainCanaryRecompute(
        baseInput(queue, client, { approval: "nope" }),
      ),
    ).rejects.toThrow(/explicit approval/);

    await expect(
      runM56E4SingleGrainCanaryRecompute(
        baseInput(queue, client, { expectedOrganizationId: "" }),
      ),
    ).rejects.toThrow(/expectedOrganizationId is required/);

    await expect(
      runM56E4SingleGrainCanaryRecompute(
        baseInput(queue, client, { expectedOrganizationId: OTHER }),
      ),
    ).rejects.toThrow(/does not match expected canary organization/);

    await expect(
      runM56E4SingleGrainCanaryRecompute(
        baseInput(queue, client, {
          expectedGrain: { ...expectedGrain, variantId: OTHER },
        }),
      ),
    ).rejects.toThrow(/does not match expected canary grain/);

    await expect(
      runM56E4SingleGrainCanaryRecompute(
        baseInput(queue, client, { expectedOwnerId: "other-owner" }),
      ),
    ).rejects.toThrow(/owner does not match/);

    await expect(
      runM56E4SingleGrainCanaryRecompute(
        baseInput(queue, client, { expectedClaimToken: "other-token" }),
      ),
    ).rejects.toThrow(/token does not match/);

    await expect(
      runM56E4SingleGrainCanaryRecompute(
        baseInput(queue, client, {
          claim: { ...claim, claimToken: "" },
          expectedClaimToken: "",
        }),
      ),
    ).rejects.toThrow(/expectedClaimToken is required/);

    await expect(
      runM56E4SingleGrainCanaryRecompute(
        baseInput(queue, client, {
          expectedClaimedGeneration: 2,
        }),
      ),
    ).rejects.toThrow(/generation does not match/);

    await expect(
      runM56E4SingleGrainCanaryRecompute(
        baseInput(queue, client, {
          expectedClaimedGeneration: 0,
        }),
      ),
    ).rejects.toThrow(/expectedClaimedGeneration must be an integer >= 1/);
  });

  it("refuses recompute when start is fenced", async () => {
    const queue = queueMock({
      start: vi.fn(async () => null),
    });

    await expect(
      runM56E4SingleGrainCanaryRecompute(baseInput(queue, client)),
    ).rejects.toThrow(/start was fenced/);
  });

  it("runs start → frozen recompute → complete for an approved canary claim", async () => {
    const queue = queueMock();

    await expect(
      runM56E4SingleGrainCanaryRecompute(baseInput(queue, client)),
    ).resolves.toEqual({
      startedAttemptCount: 1,
      completion: "succeeded",
    });

    expect(queue.start).toHaveBeenCalledWith(claim, 120);
    expect(queue.complete).toHaveBeenCalledWith(claim);
  });
});
