import fs from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createCapturingRecomputeClient,
  createMetricRecomputeQueue,
  createSkuDailyMetricRecomputeExecutor,
  isAuthorizedMetricRecomputeRequest,
  readMetricRecomputeWorkerConfig,
  type ClaimedMetricRecompute,
  type MetricRecomputeCompletion,
  type MetricRecomputeExecutor,
  type MetricRecomputeFailureOutcome,
  type MetricRecomputeQueue,
  type MetricRecomputeRpcClient,
} from "@/lib/persistence/metric-recompute-queue";
import {
  METRIC_RECOMPUTE_WORKER_SETTINGS,
  metricRecomputeIdempotencyKey,
  runMetricRecomputeTick,
  validateMetricRecomputeWorkerSettings,
} from "@/workers/aggregate-metrics";
import { workerRetryDelaySeconds } from "@/workers/retry";
import type { WorkerTelemetryEvent } from "@/workers/types";

const MIGRATION = fs.readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20261018100000_m5_6c_metric_recompute_worker.sql",
  ),
  "utf8",
);

const RPCS = [
  "recover_expired_sku_daily_metric_recompute_leases",
  "claim_sku_daily_metric_recompute_requests",
  "start_sku_daily_metric_recompute",
  "complete_sku_daily_metric_recompute",
  "fail_sku_daily_metric_recompute",
  "sku_daily_metric_recompute_queue_stats",
];

const CLAIM: ClaimedMetricRecompute = {
  organizationId: "57160000-0000-4000-8000-000000000001",
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

function functionBody(name: string): string {
  const start = MIGRATION.indexOf(`create or replace function public.${name}(`);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = MIGRATION.indexOf("\n$$;", start);

  return MIGRATION.slice(start, end);
}

interface FakeQueueOptions {
  claims?: ClaimedMetricRecompute[][];
  started?: boolean;
  completion?: MetricRecomputeCompletion;
  failure?: MetricRecomputeFailureOutcome;
  consumed?: number[];
}

function fakeQueue(options: FakeQueueOptions = {}) {
  const claims = [...(options.claims ?? [[CLAIM]])];
  const consumed = [...(options.consumed ?? [0])];
  const calls: string[] = [];
  const failArgs: unknown[][] = [];

  const queue: MetricRecomputeQueue = {
    consume: vi.fn(async () => {
      calls.push("consume");
      return consumed.shift() ?? 0;
    }),
    recover: vi.fn(async () => {
      calls.push("recover");
      return { requeued: 1, retryScheduled: 0, failed: 0 };
    }),
    claim: vi.fn(async () => {
      calls.push("claim");
      return claims.shift() ?? [];
    }),
    start: vi.fn(async () => {
      calls.push("start");
      return options.started === false
        ? null
        : { attemptCount: 2, claimedGeneration: 3, leaseExpiresAt: "x" };
    }),
    complete: vi.fn(async () => {
      calls.push("complete");
      return options.completion ?? "succeeded";
    }),
    fail: vi.fn(async (...args: unknown[]) => {
      calls.push("fail");
      failArgs.push(args);
      return options.failure ?? "retry_scheduled";
    }),
    stats: vi.fn(async () => ({ queued: 0 })),
  };

  return { queue, calls, failArgs };
}

function clock(stepMs = 0) {
  let now = Date.parse("2026-10-18T10:00:00Z");
  return () => {
    now += stepMs;
    return now;
  };
}

describe("M5.6C migration contract", () => {
  it("defines six service-role-only security definer RPCs", () => {
    for (const name of RPCS) {
      const body = functionBody(name);

      expect(body).toContain("security definer");
      expect(body).toContain("set search_path = ''");
      expect(MIGRATION).toMatch(
        new RegExp(
          `revoke all\\s+on function public\\.${name}\\([^)]*\\)\\s+from public, anon, authenticated;`,
        ),
      );
      expect(MIGRATION).toMatch(
        new RegExp(
          `grant execute\\s+on function public\\.${name}\\([^)]*\\)\\s+to service_role;`,
        ),
      );
    }

    expect(MIGRATION).not.toMatch(/grant\s+(insert|update|delete|all)/i);
    expect(MIGRATION).not.toMatch(/to\s+(anon|authenticated)\b/);
  });

  it("is additive and leaves frozen M5.5 and M5.6B objects alone", () => {
    for (const frozen of [
      "commit_sku_daily_metric",
      "sku_daily_metric_source_snapshot",
      "consume_sku_daily_metric_source_events",
      "capture_",
    ]) {
      expect(MIGRATION).not.toContain(`function public.${frozen}`);
    }

    expect(MIGRATION).not.toMatch(/drop\s+(table|function|column)/i);
    expect(MIGRATION).toContain("add column available_at timestamptz null");
    expect(MIGRATION).toContain("add column failed_reason text null");
  });

  it("serializes claim and recovery on one advisory lock and skips locked rows", () => {
    const claim = functionBody("claim_sku_daily_metric_recompute_requests");
    const recover = functionBody(
      "recover_expired_sku_daily_metric_recompute_leases",
    );

    expect(claim).toContain("pg_advisory_xact_lock(5606003)");
    expect(recover).toContain("pg_advisory_xact_lock(5606003)");
    expect(MIGRATION).not.toContain("561606");
    expect(claim).toContain("for update skip locked");
    expect(recover).toContain("for update skip locked");
    expect(claim).toContain("claimed_generation = request.dirty_generation");
    expect(claim).toContain("pg_catalog.gen_random_uuid()");
    expect(claim).toContain("p_max_active > 4");
  });

  it("fences start, complete, and fail on key, owner, token, status, and database-clock expiry", () => {
    for (const name of [
      "start_sku_daily_metric_recompute",
      "complete_sku_daily_metric_recompute",
      "fail_sku_daily_metric_recompute",
    ]) {
      const body = functionBody(name);

      for (const column of [
        "organization_id",
        "store_id",
        "location_id",
        "variant_id",
        "metric_date",
        "algorithm_version",
      ]) {
        expect(body).toContain(`.${column} = p_${column}`);
      }

      expect(body).toMatch(/lease_owner_id (=|is distinct from) p_owner_id/);
      expect(body).toMatch(
        /lease_claim_token (=|is distinct from) p_claim_token/,
      );
      expect(body).toContain("clock_timestamp()");
      expect(body).toMatch(/lease_expires_at (>|<=) (pg_catalog\.clock_timestamp\(\)|v_now)/);
    }
  });

  it("checks generation before success, deferral, or retry exhaustion", () => {
    const complete = functionBody("complete_sku_daily_metric_recompute");
    const fail = functionBody("fail_sku_daily_metric_recompute");
    const recover = functionBody(
      "recover_expired_sku_daily_metric_recompute_leases",
    );

    expect(complete.indexOf("dirty_generation <> request.claimed_generation"))
      .toBeLessThan(complete.indexOf("consumed_at is null"));
    expect(complete).toContain("event.source_date >= p_metric_date - 89");
    expect(complete).toContain("event.source_date <= p_metric_date");
    expect(complete).toContain("applied_generation = target.claimed_generation");
    expect(complete).not.toContain("event_id");
    expect(fail.indexOf("dirty_generation <> request.claimed_generation"))
      .toBeLessThan(fail.indexOf("'retry_exhausted'"));
    expect(recover.indexOf("dirty_generation <> request.claimed_generation"))
      .toBeLessThan(recover.indexOf("then 'fail'"));
  });

  it("keeps the retryable set aligned with workers/retry.ts", () => {
    const fail = functionBody("fail_sku_daily_metric_recompute");
    const retryable = fail.slice(
      fail.indexOf("v_retryable := p_error_class in ("),
      fail.indexOf(");", fail.indexOf("v_retryable := p_error_class in (")),
    );

    for (const value of [
      "transient_dependency",
      "rate_limited",
      "timeout",
      "lease_expired",
    ]) {
      expect(retryable).toContain(`'${value}'`);
    }

    expect(retryable).not.toContain("'unknown'");
  });
});

describe("M5.6C worker settings", () => {
  it("uses the approved bounds", () => {
    expect(METRIC_RECOMPUTE_WORKER_SETTINGS).toMatchObject({
      maxActive: 4,
      claimLimit: 4,
      leaseSeconds: 120,
      itemDeadlineMs: 40_000,
      tickBudgetMs: 45_000,
    });
    expect(() =>
      validateMetricRecomputeWorkerSettings({
        ...METRIC_RECOMPUTE_WORKER_SETTINGS,
        maxActive: 5,
      }),
    ).toThrow();
    expect(() =>
      validateMetricRecomputeWorkerSettings({
        ...METRIC_RECOMPUTE_WORKER_SETTINGS,
        leaseSeconds: 40,
      }),
    ).toThrow(/lease must exceed/);
  });

  it("puts the claimed generation in the idempotency key", () => {
    const key = metricRecomputeIdempotencyKey(CLAIM);

    expect(key).toContain("metrics_aggregation");
    expect(key).toContain("generation:3");
    expect(metricRecomputeIdempotencyKey({ ...CLAIM, claimedGeneration: 4 }))
      .not.toBe(key);
    expect(key).not.toContain(CLAIM.claimToken);
  });
});

describe("M5.6C tick orchestration", () => {
  it("consumes, recovers, claims, starts, recomputes, and completes in order", async () => {
    const { queue, calls } = fakeQueue();
    const execute = vi.fn<MetricRecomputeExecutor>(async () => ({ ok: true }));
    const events: WorkerTelemetryEvent[] = [];

    const result = await runMetricRecomputeTick({
      queue,
      execute,
      ownerId: "metric-recompute:test",
      now: clock(),
      emit: (event) => events.push(event),
    });

    expect(calls).toEqual([
      "consume",
      "recover",
      "claim",
      "start",
      "complete",
      "recover",
      "claim",
    ]);
    expect(execute).toHaveBeenCalledWith(CLAIM, 40_000);
    expect(result).toMatchObject({
      claimed: 1,
      started: 1,
      succeeded: 1,
      recoveredRequeued: 2,
      stoppedReason: "drained",
    });
    expect(JSON.stringify(events)).not.toContain(CLAIM.claimToken);
    expect(events.map((event) => event.eventType)).toEqual([
      "job_claimed",
      "job_started",
      "job_succeeded",
    ]);
  });

  it("does not recompute when start is fenced", async () => {
    const { queue, calls } = fakeQueue({ started: false });
    const execute = vi.fn<MetricRecomputeExecutor>();

    const result = await runMetricRecomputeTick({
      queue,
      execute,
      ownerId: "metric-recompute:test",
      now: clock(),
      emit: () => undefined,
    });

    expect(execute).not.toHaveBeenCalled();
    expect(calls).not.toContain("complete");
    expect(result.fenced).toBe(1);
  });

  it.each([
    ["superseded", "superseded"],
    ["deferred", "deferred"],
    ["fenced", "fenced"],
  ] as const)("counts a %s completion", async (completion, counter) => {
    const { queue } = fakeQueue({ completion });

    const result = await runMetricRecomputeTick({
      queue,
      execute: async () => ({ ok: true }),
      ownerId: "metric-recompute:test",
      now: clock(),
      emit: () => undefined,
    });

    expect(result[counter]).toBe(1);
    expect(result.succeeded).toBe(0);
  });

  it("reports failures with the worker backoff and attempt cap", async () => {
    const { queue, failArgs } = fakeQueue({ failure: "failed" });
    const failure = {
      failureClass: "timeout" as const,
      code: "55P03",
      message: "source lock wait timed out",
    };

    const result = await runMetricRecomputeTick({
      queue,
      execute: async () => ({ ok: false, failure }),
      ownerId: "metric-recompute:test",
      now: clock(),
      emit: () => undefined,
    });

    expect(failArgs[0]).toEqual([
      CLAIM,
      failure,
      workerRetryDelaySeconds(2),
      5,
    ]);
    expect(result.failed).toBe(1);
  });

  it("bounds consumption batches", async () => {
    const { queue } = fakeQueue({ consumed: [500, 500, 500, 500, 500] });

    const result = await runMetricRecomputeTick({
      queue,
      execute: async () => ({ ok: true }),
      ownerId: "metric-recompute:test",
      now: clock(),
      emit: () => undefined,
    });

    expect(queue.consume).toHaveBeenCalledTimes(4);
    expect(result.consumedEvents).toBe(2000);
  });

  it("does not start a round that cannot finish inside the tick budget", async () => {
    const { queue } = fakeQueue();

    const result = await runMetricRecomputeTick({
      queue,
      execute: async () => ({ ok: true }),
      ownerId: "metric-recompute:test",
      now: clock(4_000),
      emit: () => undefined,
    });

    expect(queue.claim).not.toHaveBeenCalled();
    expect(result.stoppedReason).toBe("budget");
  });

  it("survives a queue RPC failure mid-item and leaves recovery to the lease", async () => {
    const { queue } = fakeQueue();
    queue.complete = vi.fn(async () => {
      throw new Error("network");
    });

    const result = await runMetricRecomputeTick({
      queue,
      execute: async () => ({ ok: true }),
      ownerId: "metric-recompute:test",
      now: clock(),
      emit: () => undefined,
    });

    expect(result.queueErrors).toBe(1);
    expect(result.succeeded).toBe(0);
  });
});

describe("M5.6C RPC client and executor", () => {
  function snapshot() {
    return {
      timeZone: "UTC",
      sourceToken: "token",
      orders: [],
      orderItems: [],
      returnRefunds: [],
      inventorySnapshots: [],
    };
  }

  function abortableClient(
    respond: (fn: string, signal: AbortSignal | null) => Promise<{
      data: unknown;
      error: { code?: string; message: string } | null;
      status?: number;
    }>,
  ) {
    const signals: AbortSignal[] = [];
    const client: MetricRecomputeRpcClient = {
      rpc(fn) {
        let signal: AbortSignal | null = null;
        const run = () => respond(fn, signal);

        return {
          then(onFulfilled, onRejected) {
            return run().then(onFulfilled, onRejected);
          },
          abortSignal(value: AbortSignal) {
            signal = value;
            signals.push(value);
            return run();
          },
        };
      },
    };

    return { client, signals };
  }

  it("propagates the AbortSignal to every frozen M5.5 RPC and succeeds", async () => {
    const calls: string[] = [];
    const { client, signals } = abortableClient(async (fn) => {
      calls.push(fn);
      return fn === "sku_daily_metric_source_snapshot"
        ? { data: snapshot(), error: null, status: 200 }
        : { data: "metric-id", error: null, status: 200 };
    });

    const result = await createSkuDailyMetricRecomputeExecutor(client)(
      CLAIM,
      5_000,
    );

    expect(result).toEqual({ ok: true });
    expect(calls).toEqual([
      "sku_daily_metric_source_snapshot",
      "commit_sku_daily_metric",
    ]);
    expect(signals).toHaveLength(2);
  });

  it("classifies a persistent SA008 as retryable without touching the queue", async () => {
    const { client } = abortableClient(async (fn) =>
      fn === "sku_daily_metric_source_snapshot"
        ? { data: snapshot(), error: null, status: 200 }
        : {
            data: null,
            error: { code: "SA008", message: "sku daily metric source token mismatch" },
            status: 400,
          },
    );

    const result = await createSkuDailyMetricRecomputeExecutor(client)(
      CLAIM,
      5_000,
    );

    expect(result).toMatchObject({
      ok: false,
      failure: { failureClass: "transient_dependency", code: "SA008" },
    });
  });

  it("classifies a lock timeout from its SQLSTATE", async () => {
    const { client } = abortableClient(async (fn) =>
      fn === "sku_daily_metric_source_snapshot"
        ? { data: snapshot(), error: null, status: 200 }
        : {
            data: null,
            error: { code: "55P03", message: "canceling statement due to lock timeout" },
            status: 500,
          },
    );

    const result = await createSkuDailyMetricRecomputeExecutor(client)(
      CLAIM,
      5_000,
    );

    expect(result).toMatchObject({
      ok: false,
      failure: { failureClass: "timeout", code: "55P03" },
    });
  });

  it("aborts at the item deadline and reports a timeout", async () => {
    const { client } = abortableClient(
      (_fn, signal) =>
        new Promise((resolve) => {
          signal?.addEventListener("abort", () => {
            resolve({
              data: null,
              error: { code: "", message: "AbortError: aborted" },
              status: 0,
            });
          });
        }),
    );

    const result = await createSkuDailyMetricRecomputeExecutor(client)(
      CLAIM,
      20,
    );

    expect(result).toMatchObject({
      ok: false,
      failure: { failureClass: "timeout", code: "DEADLINE_EXCEEDED" },
    });
  });

  it("clears a captured error after a later successful call", async () => {
    const responses = [
      { data: null, error: { code: "SA008", message: "x" }, status: 400 },
      { data: 1, error: null, status: 200 },
    ];
    const { client } = abortableClient(async () => responses.shift()!);
    const capturing = createCapturingRecomputeClient(
      client,
      new AbortController().signal,
    );

    await capturing.client.rpc("a", {});
    expect(capturing.lastError()).toMatchObject({ code: "SA008", status: 400 });
    await capturing.client.rpc("b", {});
    expect(capturing.lastError()).toBeNull();
  });

  it("maps queue RPC rows and hides raw database messages", async () => {
    const { client } = abortableClient(async (fn) => {
      if (fn === "claim_sku_daily_metric_recompute_requests") {
        return {
          data: [
            {
              organization_id: CLAIM.organizationId,
              store_id: CLAIM.storeId,
              location_id: CLAIM.locationId,
              variant_id: CLAIM.variantId,
              metric_date: CLAIM.metricDate,
              algorithm_version: CLAIM.algorithmVersion,
              claimed_generation: 3,
              attempt_count: 0,
              lease_claim_token: CLAIM.claimToken,
              lease_expires_at: CLAIM.leaseExpiresAt,
            },
          ],
          error: null,
          status: 200,
        };
      }

      if (fn === "start_sku_daily_metric_recompute") {
        return { data: [], error: null, status: 200 };
      }

      return {
        data: null,
        error: { code: "42501", message: "permission denied for tenant data" },
        status: 403,
      };
    });
    const queue = createMetricRecomputeQueue(client);

    await expect(
      queue.claim({
        ownerId: CLAIM.ownerId,
        limit: 4,
        leaseSeconds: 120,
        maxActive: 4,
      }),
    ).resolves.toEqual([CLAIM]);
    await expect(queue.start(CLAIM, 120)).resolves.toBeNull();
    await expect(queue.complete(CLAIM)).rejects.toThrow(
      "metric recompute queue complete failed",
    );
    await expect(queue.complete(CLAIM)).rejects.not.toThrow(/tenant/);
  });

  it("passes optional organization scope to claim and recover RPCs", async () => {
    const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
    const client: MetricRecomputeRpcClient = {
      rpc(fn, args = {}) {
        calls.push({ fn, args });
        const data =
          fn === "recover_expired_sku_daily_metric_recompute_leases"
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

    await queue.claim({
      ownerId: CLAIM.ownerId,
      limit: 1,
      leaseSeconds: 120,
      maxActive: 4,
      organizationId: CLAIM.organizationId,
    });
    await queue.recover(
      { maxAttempts: 5, baseDelaySeconds: 30, maxDelaySeconds: 1800 },
      CLAIM.organizationId,
    );
    await queue.claim({
      ownerId: CLAIM.ownerId,
      limit: 1,
      leaseSeconds: 120,
      maxActive: 4,
    });
    await queue.recover({
      maxAttempts: 5,
      baseDelaySeconds: 30,
      maxDelaySeconds: 1800,
    });

    expect(calls[0]).toMatchObject({
      fn: "claim_sku_daily_metric_recompute_requests",
      args: { p_organization_id: CLAIM.organizationId },
    });
    expect(calls[1]).toMatchObject({
      fn: "recover_expired_sku_daily_metric_recompute_leases",
      args: { p_organization_id: CLAIM.organizationId },
    });
    expect(calls[2].args.p_organization_id).toBeNull();
    expect(calls[3].args.p_organization_id).toBeNull();
  });
});

describe("M5.6C trigger configuration", () => {
  const secret = "s".repeat(32);

  it("is disabled by default and fails closed without a long secret", () => {
    expect(readMetricRecomputeWorkerConfig({})).toEqual({
      enabled: false,
      secret: null,
    });
    expect(
      readMetricRecomputeWorkerConfig({
        METRIC_RECOMPUTE_WORKER_ENABLED: "true",
        METRIC_RECOMPUTE_WORKER_SECRET: secret,
      }).enabled,
    ).toBe(false);
    expect(
      readMetricRecomputeWorkerConfig({
        METRIC_RECOMPUTE_WORKER_ENABLED: "1",
        METRIC_RECOMPUTE_WORKER_SECRET: "short",
      }),
    ).toEqual({ enabled: true, secret: null });
  });

  it("accepts only the exact bearer secret", () => {
    expect(isAuthorizedMetricRecomputeRequest(`Bearer ${secret}`, secret)).toBe(
      true,
    );
    expect(isAuthorizedMetricRecomputeRequest(secret, secret)).toBe(false);
    expect(
      isAuthorizedMetricRecomputeRequest(`Bearer ${secret}x`, secret),
    ).toBe(false);
    expect(isAuthorizedMetricRecomputeRequest(null, secret)).toBe(false);
    expect(isAuthorizedMetricRecomputeRequest("Bearer short", "short")).toBe(
      false,
    );
  });
});
