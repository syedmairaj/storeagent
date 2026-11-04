import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createMetricRolloverQueue,
  evaluateMetricRolloverHttpGate,
  parseMetricRolloverOrganizationId,
  readMetricRolloverWorkerConfig,
  type MetricRolloverRpcClient,
} from "@/lib/persistence/metric-rollover";

const ORG_A = "57160000-0000-4000-8000-000000000001";
const ORG_B = "57160000-0000-4000-8000-000000000099";
const SECRET = "s".repeat(32);

function clientWith(
  data: unknown,
  error: { code?: string; message: string } | null = null,
): MetricRolloverRpcClient {
  return {
    rpc: vi.fn(async () => ({ data, error })),
  };
}

const EMPTY_RESULT = {
  storesSelected: 0,
  runsOpened: 0,
  runsResumed: 0,
  runsCompleted: 0,
  runsFailed: 0,
  grainsEnrolled: 0,
};

describe("M5-HR1.b organization env parsing", () => {
  it("accepts one UUID and normalizes case", () => {
    expect(parseMetricRolloverOrganizationId(ORG_A.toUpperCase())).toBe(
      ORG_A,
    );
    expect(
      readMetricRolloverWorkerConfig({
        METRIC_ROLLOVER_ORGANIZATION_ID: ORG_A.toUpperCase(),
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
      expect(parseMetricRolloverOrganizationId(raw)).toBeNull();
    }
  });

  it("T15: does not treat METRIC_RECOMPUTE_ORGANIZATION_ID as rollover scope", () => {
    const config = readMetricRolloverWorkerConfig({
      METRIC_ROLLOVER_WORKER_ENABLED: "1",
      METRIC_ROLLOVER_WORKER_SECRET: SECRET,
      METRIC_RECOMPUTE_ORGANIZATION_ID: ORG_A,
    });

    expect(config.organizationId).toBeNull();
    expect(
      evaluateMetricRolloverHttpGate(config, `Bearer ${SECRET}`),
    ).toEqual({
      ok: false,
      status: 503,
      error: "organization_scope_required",
    });
  });
});

describe("M5-HR1.b HTTP gate decision table", () => {
  it("T1: ENABLE≠1 → 404 regardless of org/secret", () => {
    const gate = evaluateMetricRolloverHttpGate(
      readMetricRolloverWorkerConfig({
        METRIC_ROLLOVER_WORKER_SECRET: SECRET,
        METRIC_ROLLOVER_ORGANIZATION_ID: ORG_A,
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
    const gate = evaluateMetricRolloverHttpGate(
      readMetricRolloverWorkerConfig({
        METRIC_ROLLOVER_WORKER_ENABLED: "1",
        METRIC_ROLLOVER_ORGANIZATION_ID: ORG_A,
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
    const gate = evaluateMetricRolloverHttpGate(
      readMetricRolloverWorkerConfig({
        METRIC_ROLLOVER_WORKER_ENABLED: "1",
        METRIC_ROLLOVER_WORKER_SECRET: SECRET,
        METRIC_ROLLOVER_ORGANIZATION_ID: ORG_A,
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
    const missing = evaluateMetricRolloverHttpGate(
      readMetricRolloverWorkerConfig({
        METRIC_ROLLOVER_WORKER_ENABLED: "1",
        METRIC_ROLLOVER_WORKER_SECRET: SECRET,
      }),
      `Bearer ${SECRET}`,
    );
    const invalid = evaluateMetricRolloverHttpGate(
      readMetricRolloverWorkerConfig({
        METRIC_ROLLOVER_WORKER_ENABLED: "1",
        METRIC_ROLLOVER_WORKER_SECRET: SECRET,
        METRIC_ROLLOVER_ORGANIZATION_ID: "not-a-uuid",
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

  it("T6: forged caller org keys cannot appear in the gate; only env org is trusted", () => {
    const config = readMetricRolloverWorkerConfig({
      METRIC_ROLLOVER_WORKER_ENABLED: "1",
      METRIC_ROLLOVER_WORKER_SECRET: SECRET,
      METRIC_ROLLOVER_ORGANIZATION_ID: ORG_A,
      organizationId: ORG_B,
      ORGANIZATION_ID: ORG_B,
      METRIC_RECOMPUTE_ORGANIZATION_ID: ORG_B,
    });

    const gate = evaluateMetricRolloverHttpGate(
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
      evaluateMetricRolloverHttpGate(
        readMetricRolloverWorkerConfig({
          METRIC_ROLLOVER_WORKER_ENABLED: "1",
          METRIC_ROLLOVER_WORKER_SECRET: SECRET,
          METRIC_ROLLOVER_ORGANIZATION_ID: ORG_A,
        }),
        `Bearer ${SECRET}`,
      ),
    ).toEqual({
      ok: true,
      organizationId: ORG_A,
      secret: SECRET,
    });
  });
});

describe("M5-HR1.b org-scoped enqueue RPC isolation", () => {
  it("T7: HTTP success path passes non-null trusted org into enqueue RPC", async () => {
    const client = clientWith(EMPTY_RESULT);
    const queue = createMetricRolloverQueue(client);
    const gate = evaluateMetricRolloverHttpGate(
      readMetricRolloverWorkerConfig({
        METRIC_ROLLOVER_WORKER_ENABLED: "1",
        METRIC_ROLLOVER_WORKER_SECRET: SECRET,
        METRIC_ROLLOVER_ORGANIZATION_ID: ORG_A,
      }),
      `Bearer ${SECRET}`,
    );

    expect(gate.ok).toBe(true);
    if (!gate.ok) {
      return;
    }

    await queue.enqueue({
      organizationId: gate.organizationId,
    });

    expect(client.rpc).toHaveBeenCalledWith(
      "enqueue_sku_daily_metric_daily_rollover",
      {
        p_limit: 100,
        p_max_stores: 4,
        p_organization_id: ORG_A,
        p_as_of: null,
      },
    );
    const args = (client.rpc as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(args.p_organization_id).not.toBeNull();
    expect(args.p_organization_id).toBe(ORG_A);
  });

  it("T8: library still allows explicit null for non-HTTP callers", async () => {
    const client = clientWith(EMPTY_RESULT);
    const queue = createMetricRolloverQueue(client);

    await queue.enqueue({
      organizationId: null,
    });

    expect(client.rpc).toHaveBeenCalledWith(
      "enqueue_sku_daily_metric_daily_rollover",
      expect.objectContaining({
        p_organization_id: null,
      }),
    );
  });

  it("T9: repeated scoped enqueue uses the same trusted org (idempotent identity)", async () => {
    const client = clientWith(EMPTY_RESULT);
    const queue = createMetricRolloverQueue(client);

    await queue.enqueue({ organizationId: ORG_A });
    await queue.enqueue({ organizationId: ORG_A });

    const calls = (client.rpc as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][1].p_organization_id).toBe(ORG_A);
    expect(calls[1][1].p_organization_id).toBe(ORG_A);
  });

  it("failed scoped enqueue does not retry with null org", async () => {
    const client = clientWith(null, {
      code: "57014",
      message: "canceling statement due to statement timeout",
    });
    const queue = createMetricRolloverQueue(client);

    await expect(
      queue.enqueue({ organizationId: ORG_A }),
    ).rejects.toThrow(/enqueue failed/);

    expect(client.rpc).toHaveBeenCalledTimes(1);
    expect(
      (client.rpc as ReturnType<typeof vi.fn>).mock.calls[0][1]
        .p_organization_id,
    ).toBe(ORG_A);
  });

  it("foreign org is never substituted when trusted org is set", async () => {
    const client = clientWith(EMPTY_RESULT);
    const queue = createMetricRolloverQueue(client);
    const gate = evaluateMetricRolloverHttpGate(
      readMetricRolloverWorkerConfig({
        METRIC_ROLLOVER_WORKER_ENABLED: "1",
        METRIC_ROLLOVER_WORKER_SECRET: SECRET,
        METRIC_ROLLOVER_ORGANIZATION_ID: ORG_A,
        METRIC_RECOMPUTE_ORGANIZATION_ID: ORG_B,
      }),
      `Bearer ${SECRET}`,
    );

    expect(gate.ok && gate.organizationId).toBe(ORG_A);
    if (!gate.ok) {
      return;
    }

    await queue.enqueue({ organizationId: gate.organizationId });

    expect(
      (client.rpc as ReturnType<typeof vi.fn>).mock.calls[0][1]
        .p_organization_id,
    ).toBe(ORG_A);
    expect(
      (client.rpc as ReturnType<typeof vi.fn>).mock.calls[0][1]
        .p_organization_id,
    ).not.toBe(ORG_B);
  });
});
