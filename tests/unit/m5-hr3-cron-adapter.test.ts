import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { NextRequest } from "next/server";

import {
  evaluateMetricRecomputeCronGate,
  evaluateMetricRolloverCronGate,
  isAuthorizedCronRequest,
  readCronSecret,
} from "@/lib/persistence/metric-cron-auth";
import {
  createMetricRecomputeQueue,
  readMetricRecomputeWorkerConfig,
  type ClaimedMetricRecompute,
  type MetricRecomputeQueue,
} from "@/lib/persistence/metric-recompute-queue";
import {
  createMetricRolloverQueue,
  readMetricRolloverWorkerConfig,
  type MetricRolloverRpcClient,
} from "@/lib/persistence/metric-rollover";
import {
  runMetricRecomputeTick,
} from "@/workers/aggregate-metrics";
import { GET as getRecomputeCron } from "@/app/api/internal/cron/metric-recompute/route";
import { GET as getRolloverCron } from "@/app/api/internal/cron/metric-rollover/route";

const ORG_A = "57160000-0000-4000-8000-000000000001";
const ORG_B = "57160000-0000-4000-8000-000000000099";
const CRON = "c".repeat(32);
const WORKER_SECRET = "w".repeat(32);

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

function recomputeConfig(
  overrides: Record<string, string | undefined> = {},
) {
  return readMetricRecomputeWorkerConfig({
    METRIC_RECOMPUTE_WORKER_SECRET: WORKER_SECRET,
    ...overrides,
  });
}

function rolloverConfig(
  overrides: Record<string, string | undefined> = {},
) {
  return readMetricRolloverWorkerConfig({
    METRIC_ROLLOVER_WORKER_SECRET: WORKER_SECRET,
    ...overrides,
  });
}

function clock(stepMs = 10) {
  let now = 0;
  return () => {
    now += stepMs;
    return now;
  };
}

describe("M5-HR3.1 CRON_SECRET parsing and auth", () => {
  it("accepts secrets of length ≥32", () => {
    expect(readCronSecret({ CRON_SECRET: CRON })).toBe(CRON);
    expect(
      isAuthorizedCronRequest(`Bearer ${CRON}`, CRON),
    ).toBe(true);
  });

  it("treats missing, empty, and short secrets as absent (fail closed)", () => {
    for (const raw of [undefined, "", "short", "x".repeat(31)]) {
      expect(readCronSecret({ CRON_SECRET: raw })).toBeNull();
    }
    expect(
      isAuthorizedCronRequest(`Bearer ${"x".repeat(31)}`, "x".repeat(31)),
    ).toBe(false);
  });

  it("rejects bad bearer, missing header, and worker-secret confusion", () => {
    expect(isAuthorizedCronRequest(null, CRON)).toBe(false);
    expect(isAuthorizedCronRequest(`Bearer ${WORKER_SECRET}`, CRON)).toBe(
      false,
    );
    expect(isAuthorizedCronRequest(CRON, CRON)).toBe(false);
    expect(
      isAuthorizedCronRequest(`Bearer ${CRON}x`, CRON),
    ).toBe(false);
  });

  it("malformed and oversized Authorization fail closed without throwing", () => {
    expect(() =>
      isAuthorizedCronRequest("Basic " + CRON, CRON),
    ).not.toThrow();
    expect(isAuthorizedCronRequest("Basic " + CRON, CRON)).toBe(false);

    const oversized = `Bearer ${"x".repeat(5000)}`;
    expect(() => isAuthorizedCronRequest(oversized, CRON)).not.toThrow();
    expect(isAuthorizedCronRequest(oversized, CRON)).toBe(false);

    expect(
      evaluateMetricRecomputeCronGate(
        CRON,
        recomputeConfig({
          METRIC_RECOMPUTE_WORKER_ENABLED: "1",
          METRIC_RECOMPUTE_ORGANIZATION_ID: ORG_A,
        }),
        oversized,
      ),
    ).toEqual({
      ok: false,
      status: 401,
      error: "unauthorized",
    });
  });
});

describe("M5-HR3.1 recompute cron GET decision table", () => {
  it("row 1: missing/short CRON_SECRET → 401 cron_not_configured (before ENABLE)", () => {
    const gate = evaluateMetricRecomputeCronGate(
      null,
      recomputeConfig({
        METRIC_RECOMPUTE_WORKER_ENABLED: "1",
        METRIC_RECOMPUTE_ORGANIZATION_ID: ORG_A,
      }),
      `Bearer ${CRON}`,
    );

    expect(gate).toEqual({
      ok: false,
      status: 401,
      error: "cron_not_configured",
    });
  });

  it("row 2: valid secret + bad bearer → 401 unauthorized", () => {
    const gate = evaluateMetricRecomputeCronGate(
      CRON,
      recomputeConfig({
        METRIC_RECOMPUTE_WORKER_ENABLED: "1",
        METRIC_RECOMPUTE_ORGANIZATION_ID: ORG_A,
      }),
      `Bearer ${WORKER_SECRET}`,
    );

    expect(gate).toEqual({
      ok: false,
      status: 401,
      error: "unauthorized",
    });
  });

  it("row 3: auth OK but ENABLE≠1 → 404 (zero work even with org)", () => {
    const gate = evaluateMetricRecomputeCronGate(
      CRON,
      recomputeConfig({
        METRIC_RECOMPUTE_ORGANIZATION_ID: ORG_A,
      }),
      `Bearer ${CRON}`,
    );

    expect(gate).toEqual({
      ok: false,
      status: 404,
      error: "not_found",
    });
  });

  it("row 4: ENABLE=1 + auth OK + missing/invalid org → 503", () => {
    const missing = evaluateMetricRecomputeCronGate(
      CRON,
      recomputeConfig({
        METRIC_RECOMPUTE_WORKER_ENABLED: "1",
      }),
      `Bearer ${CRON}`,
    );
    const invalid = evaluateMetricRecomputeCronGate(
      CRON,
      recomputeConfig({
        METRIC_RECOMPUTE_WORKER_ENABLED: "1",
        METRIC_RECOMPUTE_ORGANIZATION_ID: "not-a-uuid",
      }),
      `Bearer ${CRON}`,
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
  });

  it("row 5: auth + ENABLE + org → ok with trusted org (ignores forged env keys)", () => {
    const gate = evaluateMetricRecomputeCronGate(
      CRON,
      recomputeConfig({
        METRIC_RECOMPUTE_WORKER_ENABLED: "1",
        METRIC_RECOMPUTE_ORGANIZATION_ID: ORG_A,
        METRIC_ROLLOVER_ORGANIZATION_ID: ORG_B,
        organizationId: ORG_B,
      }),
      `Bearer ${CRON}`,
    );

    expect(gate).toEqual({
      ok: true,
      organizationId: ORG_A,
      maxActive: 1,
      claimLimit: 1,
    });
  });

  it("does not require METRIC_RECOMPUTE_WORKER_SECRET for cron success", () => {
    const gate = evaluateMetricRecomputeCronGate(
      CRON,
      readMetricRecomputeWorkerConfig({
        METRIC_RECOMPUTE_WORKER_ENABLED: "1",
        METRIC_RECOMPUTE_ORGANIZATION_ID: ORG_A,
      }),
      `Bearer ${CRON}`,
    );

    expect(gate.ok).toBe(true);
    if (gate.ok) {
      expect(gate.organizationId).toBe(ORG_A);
    }
  });
});

describe("M5-HR3.1 rollover cron GET decision table", () => {
  it("row 1–4 fail closed with contract status codes", () => {
    expect(
      evaluateMetricRolloverCronGate(
        null,
        rolloverConfig({
          METRIC_ROLLOVER_WORKER_ENABLED: "1",
          METRIC_ROLLOVER_ORGANIZATION_ID: ORG_A,
        }),
        `Bearer ${CRON}`,
      ),
    ).toEqual({
      ok: false,
      status: 401,
      error: "cron_not_configured",
    });

    expect(
      evaluateMetricRolloverCronGate(
        CRON,
        rolloverConfig({
          METRIC_ROLLOVER_WORKER_ENABLED: "1",
          METRIC_ROLLOVER_ORGANIZATION_ID: ORG_A,
        }),
        `Bearer wrong`,
      ),
    ).toEqual({
      ok: false,
      status: 401,
      error: "unauthorized",
    });

    expect(
      evaluateMetricRolloverCronGate(
        CRON,
        rolloverConfig({
          METRIC_ROLLOVER_ORGANIZATION_ID: ORG_A,
        }),
        `Bearer ${CRON}`,
      ),
    ).toEqual({
      ok: false,
      status: 404,
      error: "not_found",
    });

    expect(
      evaluateMetricRolloverCronGate(
        CRON,
        rolloverConfig({
          METRIC_ROLLOVER_WORKER_ENABLED: "1",
          METRIC_RECOMPUTE_ORGANIZATION_ID: ORG_A,
        }),
        `Bearer ${CRON}`,
      ),
    ).toEqual({
      ok: false,
      status: 503,
      error: "organization_scope_required",
    });
  });

  it("row 5: trusted rollover org only; never recompute org fallback", () => {
    const gate = evaluateMetricRolloverCronGate(
      CRON,
      rolloverConfig({
        METRIC_ROLLOVER_WORKER_ENABLED: "1",
        METRIC_ROLLOVER_ORGANIZATION_ID: ORG_A,
        METRIC_RECOMPUTE_ORGANIZATION_ID: ORG_B,
      }),
      `Bearer ${CRON}`,
    );

    expect(gate).toEqual({
      ok: true,
      organizationId: ORG_A,
    });
  });
});

describe("M5-HR3.1 in-process tick/enqueue isolation (no global fallback)", () => {
  it("recompute tick receives trusted org for consume/recover/claim", async () => {
    const queue: MetricRecomputeQueue = {
      consume: vi.fn(async () => 0),
      recover: vi.fn(async () => ({
        requeued: 0,
        retryScheduled: 0,
        failed: 0,
      })),
      claim: vi.fn(async () => [] as ClaimedMetricRecompute[]),
      start: vi.fn(),
      complete: vi.fn(),
      fail: vi.fn(),
      stats: vi.fn(async () => ({})),
    };

    const gate = evaluateMetricRecomputeCronGate(
      CRON,
      recomputeConfig({
        METRIC_RECOMPUTE_WORKER_ENABLED: "1",
        METRIC_RECOMPUTE_ORGANIZATION_ID: ORG_A,
      }),
      `Bearer ${CRON}`,
    );
    expect(gate.ok).toBe(true);
    if (!gate.ok) {
      return;
    }

    await runMetricRecomputeTick({
      queue,
      execute: async () => ({ ok: true }),
      ownerId: "metric-recompute:cron-test",
      organizationId: gate.organizationId,
      now: clock(),
      emit: () => undefined,
    });

    expect(queue.consume).toHaveBeenCalledWith(expect.any(Number), ORG_A);
    expect(queue.recover).toHaveBeenCalledWith(
      expect.anything(),
      ORG_A,
    );
    expect(queue.claim).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG_A,
      }),
    );
    expect(queue.start).not.toHaveBeenCalled();
  });

  it("foreign claimed row is not started (no cross-org execution)", async () => {
    const foreign: ClaimedMetricRecompute = {
      ...CLAIM_A,
      organizationId: ORG_B,
    };
    let claimed = false;
    const queue: MetricRecomputeQueue = {
      consume: vi.fn(async () => 0),
      recover: vi.fn(async () => ({
        requeued: 0,
        retryScheduled: 0,
        failed: 0,
      })),
      claim: vi.fn(async () => {
        if (claimed) {
          return [];
        }
        claimed = true;
        return [foreign];
      }),
      start: vi.fn(),
      complete: vi.fn(),
      fail: vi.fn(),
      stats: vi.fn(async () => ({})),
    };

    const result = await runMetricRecomputeTick({
      queue,
      execute: async () => ({ ok: true }),
      ownerId: "metric-recompute:cron-test",
      organizationId: ORG_A,
      now: clock(),
      emit: () => undefined,
    });

    expect(queue.start).not.toHaveBeenCalled();
    expect(queue.complete).not.toHaveBeenCalled();
    expect(queue.fail).not.toHaveBeenCalled();
    expect(result.queueErrors).toBeGreaterThan(0);
  });

  it("rollover enqueue passes trusted org; failed call does not retry null", async () => {
    const client: MetricRolloverRpcClient = {
      rpc: vi.fn(async () => ({
        data: null,
        error: { message: "enqueue failed", code: "57014" },
      })),
    };
    const queue = createMetricRolloverQueue(client);
    const gate = evaluateMetricRolloverCronGate(
      CRON,
      rolloverConfig({
        METRIC_ROLLOVER_WORKER_ENABLED: "1",
        METRIC_ROLLOVER_ORGANIZATION_ID: ORG_A,
      }),
      `Bearer ${CRON}`,
    );
    expect(gate.ok).toBe(true);
    if (!gate.ok) {
      return;
    }

    await expect(
      queue.enqueue({ organizationId: gate.organizationId }),
    ).rejects.toThrow(/enqueue failed/);

    expect(client.rpc).toHaveBeenCalledTimes(1);
    expect(
      (client.rpc as ReturnType<typeof vi.fn>).mock.calls[0][1]
        .p_organization_id,
    ).toBe(ORG_A);
  });

  it("scoped enqueue RPC uses non-null trusted org", async () => {
    const client: MetricRolloverRpcClient = {
      rpc: vi.fn(async () => ({
        data: {
          storesSelected: 0,
          runsOpened: 0,
          runsResumed: 0,
          runsCompleted: 0,
          runsFailed: 0,
          grainsEnrolled: 0,
        },
        error: null,
      })),
    };
    const queue = createMetricRolloverQueue(client);

    await queue.enqueue({ organizationId: ORG_A });

    expect(client.rpc).toHaveBeenCalledWith(
      "enqueue_sku_daily_metric_daily_rollover",
      expect.objectContaining({
        p_organization_id: ORG_A,
      }),
    );
    expect(
      (client.rpc as ReturnType<typeof vi.fn>).mock.calls[0][1]
        .p_organization_id,
    ).not.toBeNull();
  });

  it("gate failures imply zero enqueue/consume side effects", () => {
    const consume = vi.fn();
    const enqueue = vi.fn();

    for (const gate of [
      evaluateMetricRecomputeCronGate(null, recomputeConfig({
        METRIC_RECOMPUTE_WORKER_ENABLED: "1",
        METRIC_RECOMPUTE_ORGANIZATION_ID: ORG_A,
      }), `Bearer ${CRON}`),
      evaluateMetricRecomputeCronGate(CRON, recomputeConfig({
        METRIC_RECOMPUTE_ORGANIZATION_ID: ORG_A,
      }), `Bearer ${CRON}`),
      evaluateMetricRolloverCronGate(CRON, rolloverConfig({
        METRIC_ROLLOVER_WORKER_ENABLED: "1",
      }), `Bearer ${CRON}`),
    ]) {
      expect(gate.ok).toBe(false);
      if (!gate.ok) {
        // Routes return before createSupabaseAdminClient / tick / enqueue.
        expect(consume).not.toHaveBeenCalled();
        expect(enqueue).not.toHaveBeenCalled();
      }
    }
  });

  it("createMetricRecomputeQueue remains available for in-process cron wiring", () => {
    expect(typeof createMetricRecomputeQueue).toBe("function");
  });
});

describe("M5-HR3.1 cron route §2.4 auth-before-config", () => {
  const ORIGINAL_ENV = process.env;

  function withEnv(
    patch: Record<string, string | undefined>,
    run: () => Promise<void>,
  ): Promise<void> {
    const next: Record<string, string | undefined> = {
      ...ORIGINAL_ENV,
    };
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) {
        delete next[key];
      } else {
        next[key] = value;
      }
    }
    process.env = next as NodeJS.ProcessEnv;
    return run().finally(() => {
      process.env = ORIGINAL_ENV;
    });
  }

  it("missing CRON_SECRET → 401 even when concurrency env would misconfigure", async () => {
    await withEnv(
      {
        CRON_SECRET: undefined,
        METRIC_RECOMPUTE_WORKER_ENABLED: "1",
        METRIC_RECOMPUTE_ORGANIZATION_ID: ORG_A,
        METRIC_RECOMPUTE_MAX_ACTIVE: "99",
        METRIC_ROLLOVER_WORKER_ENABLED: "1",
        METRIC_ROLLOVER_ORGANIZATION_ID: ORG_A,
      },
      async () => {
        const recompute = await getRecomputeCron(
          new NextRequest(
            "http://localhost/api/internal/cron/metric-recompute",
          ),
        );
        expect(recompute.status).toBe(401);
        await expect(recompute.json()).resolves.toMatchObject({
          error: "cron_not_configured",
        });

        const rollover = await getRolloverCron(
          new NextRequest(
            "http://localhost/api/internal/cron/metric-rollover",
          ),
        );
        expect(rollover.status).toBe(401);
        await expect(rollover.json()).resolves.toMatchObject({
          error: "cron_not_configured",
        });
      },
    );
  });

  it("valid CRON auth + ENABLE off → 404 without creating admin client side effects", async () => {
    await withEnv(
      {
        CRON_SECRET: CRON,
        METRIC_RECOMPUTE_WORKER_ENABLED: undefined,
        METRIC_RECOMPUTE_ORGANIZATION_ID: ORG_A,
        METRIC_ROLLOVER_WORKER_ENABLED: undefined,
        METRIC_ROLLOVER_ORGANIZATION_ID: ORG_A,
      },
      async () => {
        const recompute = await getRecomputeCron(
          new NextRequest(
            "http://localhost/api/internal/cron/metric-recompute",
            {
              headers: {
                authorization: `Bearer ${CRON}`,
              },
            },
          ),
        );
        expect(recompute.status).toBe(404);
        expect(recompute.headers.get("cache-control")).toBe("no-store");

        const rollover = await getRolloverCron(
          new NextRequest(
            "http://localhost/api/internal/cron/metric-rollover",
            {
              headers: {
                authorization: `Bearer ${CRON}`,
              },
            },
          ),
        );
        expect(rollover.status).toBe(404);
        expect(rollover.headers.get("cache-control")).toBe("no-store");
      },
    );
  });
});
