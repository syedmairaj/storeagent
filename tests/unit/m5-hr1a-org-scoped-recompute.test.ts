import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createMetricRecomputeQueue,
  evaluateMetricRecomputeHttpGate,
  parseMetricRecomputeOrganizationId,
  readMetricRecomputeWorkerConfig,
  type ClaimedMetricRecompute,
  type MetricRecomputeExecutor,
  type MetricRecomputeQueue,
  type MetricRecomputeRpcClient,
} from "@/lib/persistence/metric-recompute-queue";
import {
  metricRecomputeIdempotencyKey,
  runMetricRecomputeTick,
} from "@/workers/aggregate-metrics";
import type { WorkerTelemetryEvent } from "@/workers/types";

const ORG_A = "57160000-0000-4000-8000-000000000001";
const ORG_B = "57160000-0000-4000-8000-000000000099";
const SECRET = "s".repeat(32);

const CLAIM_A: ClaimedMetricRecompute = {
  organizationId: ORG_A,
  storeId: "57160000-0000-4000-8000-000000000002",
  locationId: "57160000-0000-4000-8000-000000000003",
  variantId: "57160000-0000-4000-8000-000000000006",
  metricDate: "2026-10-18",
  algorithmVersion: "m5-derived-metrics-v1",
  ownerId: "metric-recompute:test",
  claimToken: "secret-claim-token",
  claimedGeneration: 3,
  attemptCount: 0,
  leaseExpiresAt: "2026-10-18T10:02:00Z",
};

const CLAIM_B: ClaimedMetricRecompute = {
  ...CLAIM_A,
  organizationId: ORG_B,
  claimToken: "foreign-claim-token",
};

function clock(stepMs = 10) {
  let now = 0;
  return () => {
    now += stepMs;
    return now;
  };
}

function fakeQueue(claims: ClaimedMetricRecompute[][] = [[CLAIM_A]]) {
  const remaining = [...claims];
  const queue: MetricRecomputeQueue = {
    consume: vi.fn(async () => 0),
    recover: vi.fn(async () => ({
      requeued: 0,
      retryScheduled: 0,
      failed: 0,
    })),
    claim: vi.fn(async () => remaining.shift() ?? []),
    start: vi.fn(async () => ({
      attemptCount: 1,
      claimedGeneration: CLAIM_A.claimedGeneration,
      leaseExpiresAt: CLAIM_A.leaseExpiresAt,
    })),
    complete: vi.fn(async () => "succeeded" as const),
    fail: vi.fn(async () => "retry_scheduled" as const),
    stats: vi.fn(async () => ({})),
  };

  return queue;
}

describe("M5-HR1.a organization env parsing", () => {
  it("accepts one UUID and normalizes case", () => {
    expect(parseMetricRecomputeOrganizationId(ORG_A.toUpperCase())).toBe(
      ORG_A,
    );
    expect(
      readMetricRecomputeWorkerConfig({
        METRIC_RECOMPUTE_ORGANIZATION_ID: ORG_A.toUpperCase(),
      }).organizationId,
    ).toBe(ORG_A);
  });

  it("rejects absent, empty, padded, multi-value, and non-UUID input", () => {
    for (const raw of [
      undefined,
      "",
      " ",
      ` ${ORG_A}`,
      `${ORG_A} `,
      `${ORG_A},${ORG_B}`,
      `${ORG_A};${ORG_B}`,
      "not-a-uuid",
      "57160000-0000-4000-8000",
    ]) {
      expect(parseMetricRecomputeOrganizationId(raw)).toBeNull();
    }
  });
});

describe("M5-HR1.a HTTP gate decision table", () => {
  it("T1: ENABLE≠1 → 404 regardless of org/secret (distinguishable from 503)", () => {
    const gate = evaluateMetricRecomputeHttpGate(
      readMetricRecomputeWorkerConfig({
        METRIC_RECOMPUTE_WORKER_SECRET: SECRET,
        METRIC_RECOMPUTE_ORGANIZATION_ID: ORG_A,
      }),
      `Bearer ${SECRET}`,
    );

    expect(gate).toEqual({
      ok: false,
      status: 404,
      error: "not_found",
    });
  });

  it("T2: ENABLE=1 without long secret → 503 worker_not_configured", () => {
    const gate = evaluateMetricRecomputeHttpGate(
      readMetricRecomputeWorkerConfig({
        METRIC_RECOMPUTE_WORKER_ENABLED: "1",
        METRIC_RECOMPUTE_ORGANIZATION_ID: ORG_A,
      }),
      `Bearer ${SECRET}`,
    );

    expect(gate).toEqual({
      ok: false,
      status: 503,
      error: "worker_not_configured",
    });
  });

  it("T3: ENABLE=1 valid secret bad bearer → 401", () => {
    const gate = evaluateMetricRecomputeHttpGate(
      readMetricRecomputeWorkerConfig({
        METRIC_RECOMPUTE_WORKER_ENABLED: "1",
        METRIC_RECOMPUTE_WORKER_SECRET: SECRET,
        METRIC_RECOMPUTE_ORGANIZATION_ID: ORG_A,
      }),
      `Bearer ${SECRET}x`,
    );

    expect(gate).toEqual({
      ok: false,
      status: 401,
      error: "unauthorized",
    });
  });

  it("T4/T5: ENABLE=1 auth OK missing/invalid org → 503 organization_scope_required", () => {
    const missing = evaluateMetricRecomputeHttpGate(
      readMetricRecomputeWorkerConfig({
        METRIC_RECOMPUTE_WORKER_ENABLED: "1",
        METRIC_RECOMPUTE_WORKER_SECRET: SECRET,
      }),
      `Bearer ${SECRET}`,
    );
    const invalid = evaluateMetricRecomputeHttpGate(
      readMetricRecomputeWorkerConfig({
        METRIC_RECOMPUTE_WORKER_ENABLED: "1",
        METRIC_RECOMPUTE_WORKER_SECRET: SECRET,
        METRIC_RECOMPUTE_ORGANIZATION_ID: "not-a-uuid",
      }),
      `Bearer ${SECRET}`,
    );

    expect(missing).toEqual({
      ok: false,
      status: 503,
      error: "organization_scope_required",
    });
    expect(invalid).toEqual({
      ok: false,
      status: 503,
      error: "organization_scope_required",
    });
    expect(missing.ok).toBe(false);
    expect(invalid.ok).toBe(false);
    if (!missing.ok && !invalid.ok) {
      expect(missing.status).toBe(503);
      expect(invalid.status).toBe(503);
      expect(missing.status).not.toBe(404);
      expect(invalid.status).not.toBe(404);
    }
  });

  it("T6: forged caller org cannot appear in the gate; only env org is trusted", () => {
    const config = readMetricRecomputeWorkerConfig({
      METRIC_RECOMPUTE_WORKER_ENABLED: "1",
      METRIC_RECOMPUTE_WORKER_SECRET: SECRET,
      METRIC_RECOMPUTE_ORGANIZATION_ID: ORG_A,
      // Attacker-controlled lookalikes must be ignored by config reader.
      organizationId: ORG_B,
      ORGANIZATION_ID: ORG_B,
    });

    const gate = evaluateMetricRecomputeHttpGate(
      config,
      `Bearer ${SECRET}`,
    );

    expect(gate).toMatchObject({
      ok: true,
      organizationId: ORG_A,
    });
    expect(gate.ok && gate.organizationId).not.toBe(ORG_B);
  });

  it("row 5: enabled + secret + auth + valid org → ok with trusted org", () => {
    expect(
      evaluateMetricRecomputeHttpGate(
        readMetricRecomputeWorkerConfig({
          METRIC_RECOMPUTE_WORKER_ENABLED: "1",
          METRIC_RECOMPUTE_WORKER_SECRET: SECRET,
          METRIC_RECOMPUTE_ORGANIZATION_ID: ORG_A,
        }),
        `Bearer ${SECRET}`,
      ),
    ).toEqual({
      ok: true,
      organizationId: ORG_A,
      secret: SECRET,
      maxActive: 1,
      claimLimit: 1,
    });
  });
});

describe("M5-HR1.a org-scoped tick isolation", () => {
  it("T7: passes trusted org to consume, recover, and claim (never null)", async () => {
    const queue = fakeQueue();

    await runMetricRecomputeTick({
      queue,
      execute: async () => ({ ok: true }),
      ownerId: "metric-recompute:test",
      organizationId: ORG_A,
      now: clock(),
      emit: () => undefined,
    });

    expect(queue.consume).toHaveBeenCalledWith(500, ORG_A);
    expect(queue.recover).toHaveBeenCalledWith(
      expect.objectContaining({ maxAttempts: 5 }),
      ORG_A,
    );
    expect(queue.claim).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG_A }),
    );
    for (const call of (queue.consume as ReturnType<typeof vi.fn>).mock.calls) {
      expect(call[1]).not.toBeNull();
      expect(call[1]).not.toBeUndefined();
    }
  });

  it("T8: foreign claimed row → no start/complete/fail", async () => {
    const queue = fakeQueue([[CLAIM_B]]);
    const execute = vi.fn<MetricRecomputeExecutor>();
    const events: WorkerTelemetryEvent[] = [];

    const result = await runMetricRecomputeTick({
      queue,
      execute,
      ownerId: "metric-recompute:test",
      organizationId: ORG_A,
      now: clock(),
      emit: (event) => events.push(event),
    });

    expect(execute).not.toHaveBeenCalled();
    expect(queue.start).not.toHaveBeenCalled();
    expect(queue.complete).not.toHaveBeenCalled();
    expect(queue.fail).not.toHaveBeenCalled();
    expect(result.queueErrors).toBe(1);
    expect(result.started).toBe(0);
    expect(result.succeeded).toBe(0);
    expect(events.some((event) => event.code === "ORG_SCOPE_MISMATCH")).toBe(
      true,
    );
  });

  it("T9: idempotency key remains generation-stable under org scope", () => {
    const key = metricRecomputeIdempotencyKey(CLAIM_A);
    expect(key).toContain(ORG_A);
    expect(key).toContain("generation:3");
    expect(
      metricRecomputeIdempotencyKey({
        ...CLAIM_A,
        claimedGeneration: 3,
      }),
    ).toBe(key);
    expect(
      metricRecomputeIdempotencyKey({
        ...CLAIM_A,
        claimedGeneration: 4,
      }),
    ).not.toBe(key);
  });

  it("T10: retryable fail still uses org-scoped claim path and fail RPC", async () => {
    const queue = fakeQueue([[CLAIM_A], []]);
    queue.complete = vi.fn(async () => {
      throw new Error("unused");
    });
    queue.fail = vi.fn(async () => "retry_scheduled" as const);

    const result = await runMetricRecomputeTick({
      queue,
      execute: async () => ({
        ok: false,
        failure: {
          failureClass: "timeout",
          code: "55P03",
          message: "source lock wait timed out",
        },
      }),
      ownerId: "metric-recompute:test",
      organizationId: ORG_A,
      now: clock(),
      emit: () => undefined,
    });

    expect(queue.claim).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG_A }),
    );
    expect(queue.fail).toHaveBeenCalled();
    expect(queue.complete).not.toHaveBeenCalled();
    expect(result.retryScheduled).toBe(1);
  });

  it("T11: fenced start does not widen scope or call complete/fail", async () => {
    const queue = fakeQueue();
    queue.start = vi.fn(async () => null);

    const result = await runMetricRecomputeTick({
      queue,
      execute: async () => ({ ok: true }),
      ownerId: "metric-recompute:test",
      organizationId: ORG_A,
      now: clock(),
      emit: () => undefined,
    });

    expect(result.fenced).toBe(1);
    expect(queue.complete).not.toHaveBeenCalled();
    expect(queue.fail).not.toHaveBeenCalled();
    expect(queue.claim).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG_A }),
    );
  });
});

describe("M5-HR1.a library global-null preserved for non-HTTP callers", () => {
  it("consume/recover/claim still allow null organization for library use", async () => {
    const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
    const client: MetricRecomputeRpcClient = {
      rpc(fn, args = {}) {
        calls.push({ fn, args });
        const data =
          fn === "consume_sku_daily_metric_source_events"
            ? 0
            : fn === "recover_expired_sku_daily_metric_recompute_leases"
              ? [{ requeued: 0, retry_scheduled: 0, failed: 0 }]
              : [];

        return {
          then(onFulfilled, onRejected) {
            return Promise.resolve({ data, error: null, status: 200 }).then(
              onFulfilled,
              onRejected,
            );
          },
        };
      },
    };
    const queue = createMetricRecomputeQueue(client);

    await queue.consume(10);
    await queue.recover({
      maxAttempts: 5,
      baseDelaySeconds: 30,
      maxDelaySeconds: 1800,
    });
    await queue.claim({
      ownerId: "lib",
      limit: 1,
      leaseSeconds: 120,
      maxActive: 1,
    });

    expect(calls[0].args.p_organization_id).toBeNull();
    expect(calls[1].args.p_organization_id).toBeNull();
    expect(calls[2].args.p_organization_id).toBeNull();
  });
});
