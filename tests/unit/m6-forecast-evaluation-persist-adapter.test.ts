import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("server-only", () => ({}));

import {
  FORECAST_BACKTEST_MIN_ORIGINS_V1,
} from "@/lib/forecasting/backtest-harness";

import {
  validateHistoricalEvidenceIntegrity,
  type HistoricalEvidenceCandidateRevision,
  type HistoricalEvidenceIntegrityResult,
} from "@/lib/forecasting/historical-evidence-integrity";

import { shiftForecastDate } from "@/lib/forecasting/series";

import {
  buildForecastEvaluationPersistPayload,
  ForecastEvaluationPersistConflictError,
  ForecastEvaluationPersistDeniedError,
  ForecastEvaluationPersistUnavailableError,
  ForecastEvaluationPersistValidationError,
  persistForecastEvaluation,
  type ForecastEvaluationPersistClient,
} from "@/lib/persistence/persist-forecast-evaluation";

import type { TenantContext } from "@/lib/tenancy/types";

const ORG = "6100b000-0000-4000-8000-000000000001";
const STORE = "6100b000-0000-4000-8000-000000000002";
const LOCATION = "6100b000-0000-4000-8000-000000000003";
const VARIANT = "6100b000-0000-4000-8000-000000000005";
const USER = "6100b000-0000-4000-8000-000000000007";
const RUN_ID = "6100b000-0000-4000-8000-0000000000a1";
const START = "2026-01-01";
const TZ = "UTC";

const TENANT: TenantContext = {
  userId: USER,
  organizationId: ORG,
  role: "owner",
  storeId: STORE,
};

function revision(
  date: string,
  overrides: Partial<HistoricalEvidenceCandidateRevision> = {},
): HistoricalEvidenceCandidateRevision {
  return {
    sourceIdentity: `day:${date}`,
    claimKind: "day_outcome",
    organizationId: ORG,
    storeId: STORE,
    locationId: LOCATION,
    variantId: VARIANT,
    businessDate: date,
    knownAsOf: date,
    unitsSold: 2,
    availability: "available",
    promotionState: "none",
    dataComplete: true,
    ...overrides,
  };
}

function denseRevisions(dayCount: number): HistoricalEvidenceCandidateRevision[] {
  const rows: HistoricalEvidenceCandidateRevision[] = [];
  for (let i = 0; i < dayCount; i += 1) {
    rows.push(revision(shiftForecastDate(START, i)));
  }
  return rows;
}

function acceptedIntegrity(
  dayCount = 40,
): HistoricalEvidenceIntegrityResult {
  const result = validateHistoricalEvidenceIntegrity({
    sourceClass: "controlled_pit_fixture",
    grain: {
      organizationId: ORG,
      storeId: STORE,
      locationId: LOCATION,
      variantId: VARIANT,
    },
    pinnedTimeZone: TZ,
    revisions: denseRevisions(dayCount),
  });
  expect(result.disposition).toBe("accepted");
  return result;
}

function rejectedIntegrity(): HistoricalEvidenceIntegrityResult {
  return validateHistoricalEvidenceIntegrity({
    sourceClass: "unsupported_live_canonical",
    grain: {
      organizationId: ORG,
      storeId: STORE,
      locationId: LOCATION,
      variantId: VARIANT,
    },
    pinnedTimeZone: TZ,
    revisions: denseRevisions(3),
  });
}

function mockClient(
  handler: (fn: string, args: Record<string, unknown>) => {
    data: unknown;
    error: { code?: string; message: string } | null;
  },
): ForecastEvaluationPersistClient {
  return {
    rpc: async (fn, args) => handler(fn, args),
  };
}

describe("M6 P4c.2 forecast evaluation persist adapter", () => {
  it("maps accepted preliminary harness results with three model scores", async () => {
    const integrity = acceptedIntegrity();
    const captured: { payload: Record<string, unknown> | null } = {
      payload: null,
    };

    const client = mockClient((fn, args) => {
      expect(fn).toBe("persist_forecast_evaluation_result");
      captured.payload = args.p_payload as Record<string, unknown>;
      return {
        data: {
          ok: true,
          disposition: "created",
          evaluationRunId: RUN_ID,
          isScoredEvaluation: true,
          claimsProductionApproval: false,
          claimsM7NumericEligibility: false,
          algorithmApproved: false,
        },
        error: null,
      };
    });

    const result = await persistForecastEvaluation(
      {
        tenant: TENANT,
        locationId: LOCATION,
        variantId: VARIANT,
        originStart: shiftForecastDate(START, 10),
        originEnd: shiftForecastDate(
          START,
          10 + FORECAST_BACKTEST_MIN_ORIGINS_V1 - 1,
        ),
        lookbackDays: 7,
        integrity,
      },
      client,
    );

    expect(result.disposition).toBe("created");
    expect(result.isScoredEvaluation).toBe(true);
    expect(result.harness?.disposition).toBe("preliminary");
    expect(result.payload.models).toHaveLength(3);
    expect(result.payload.originCount).toBe(FORECAST_BACKTEST_MIN_ORIGINS_V1);
    expect(result.payload.claimsProductionApproval).toBe(false);
    expect(result.payload.algorithmApproved).toBe(false);
    expect(captured.payload).not.toBeNull();
    expect(captured.payload?.bodyHash).toBe(result.payload.bodyHash);
    expect(typeof captured.payload?.bodyHash).toBe("string");
    expect(String(captured.payload?.bodyHash)).toHaveLength(32);
  });

  it("maps insufficient-sample diagnostics and preserves nullable metrics", async () => {
    const integrity = acceptedIntegrity();
    const client = mockClient((_fn, args) => {
      const payload = args.p_payload as {
        evaluationDisposition: string;
        models: Array<{
          wape: number | null;
          mase: number | null;
          metricReasonCodes: string[];
        }>;
        originCount: number;
      };
      expect(payload.evaluationDisposition).toBe(
        "INSUFFICIENT_BACKTEST_POINTS",
      );
      expect(payload.originCount).toBe(3);
      expect(payload.models).toHaveLength(3);
      return {
        data: {
          ok: true,
          disposition: "created",
          evaluationRunId: RUN_ID,
          isScoredEvaluation: true,
          claimsProductionApproval: false,
          claimsM7NumericEligibility: false,
          algorithmApproved: false,
        },
        error: null,
      };
    });

    const result = await persistForecastEvaluation(
      {
        tenant: TENANT,
        locationId: LOCATION,
        variantId: VARIANT,
        originStart: shiftForecastDate(START, 10),
        originEnd: shiftForecastDate(START, 12),
        lookbackDays: 7,
        integrity,
      },
      client,
    );

    expect(result.isScoredEvaluation).toBe(true);
    expect(result.payload.evaluationDisposition).toBe(
      "INSUFFICIENT_BACKTEST_POINTS",
    );
    for (const model of result.payload.models) {
      expect(Number.isFinite(model.mae as number) || model.mae === null).toBe(
        true,
      );
      if (model.wape !== null) {
        expect(Number.isFinite(model.wape)).toBe(true);
      }
      if (model.mase !== null) {
        expect(Number.isFinite(model.mase)).toBe(true);
      }
    }
  });

  it("persists rejected integrity as audit-only with zero model scores", async () => {
    const integrity = rejectedIntegrity();
    expect(integrity.disposition).toBe("UNSUPPORTED_HISTORICAL_REPLAY");

    const client = mockClient((_fn, args) => {
      const payload = args.p_payload as {
        models: unknown[];
        originCount: number;
        isScoredEvaluation?: boolean;
        evaluationDisposition: string;
      };
      expect(payload.models).toEqual([]);
      expect(payload.originCount).toBe(0);
      expect(payload.evaluationDisposition).toBe(
        "UNSUPPORTED_HISTORICAL_REPLAY",
      );
      return {
        data: {
          ok: true,
          disposition: "created",
          evaluationRunId: RUN_ID,
          isScoredEvaluation: false,
          claimsProductionApproval: false,
          claimsM7NumericEligibility: false,
          algorithmApproved: false,
        },
        error: null,
      };
    });

    const result = await persistForecastEvaluation(
      {
        tenant: TENANT,
        locationId: LOCATION,
        variantId: VARIANT,
        originStart: shiftForecastDate(START, 10),
        originEnd: shiftForecastDate(START, 12),
        lookbackDays: 7,
        integrity,
        pinnedTimeZone: TZ,
      },
      client,
    );

    expect(result.isScoredEvaluation).toBe(false);
    expect(result.harness).toBeNull();
    expect(result.payload.models).toEqual([]);
  });

  it("buildForecastEvaluationPersistPayload is deterministic for the same harness", async () => {
    const integrity = acceptedIntegrity() as Extract<
      HistoricalEvidenceIntegrityResult,
      { disposition: "accepted" }
    >;

    const { evaluateForecastBacktestHarness } = await import(
      "@/lib/forecasting/backtest-harness"
    );

    const harness = evaluateForecastBacktestHarness({
      grain: integrity.grain,
      originStart: shiftForecastDate(START, 10),
      originEnd: shiftForecastDate(START, 12),
      lookbackDays: 7,
      facts: integrity.facts,
    });

    const first = buildForecastEvaluationPersistPayload({
      grain: integrity.grain,
      originStart: shiftForecastDate(START, 10),
      originEnd: shiftForecastDate(START, 12),
      lookbackDays: 7,
      integrity,
      harness,
      pinnedTimeZone: TZ,
    });
    const second = buildForecastEvaluationPersistPayload({
      grain: integrity.grain,
      originStart: shiftForecastDate(START, 10),
      originEnd: shiftForecastDate(START, 12),
      lookbackDays: 7,
      integrity,
      harness,
      pinnedTimeZone: TZ,
    });

    expect(first.bodyHash).toBe(second.bodyHash);
    expect(first.fixtureFingerprint).toBe(second.fixtureFingerprint);
    expect(first.algorithmVersionsFingerprint).toMatch(/^[a-f0-9]{32}$/);
    expect(first.bodyHash).toMatch(/^[a-f0-9]{32}$/);
  });

  it("rejects forbidden client-supplied hash and org keys", async () => {
    const integrity = acceptedIntegrity();

    await expect(
      persistForecastEvaluation({
        tenant: TENANT,
        locationId: LOCATION,
        variantId: VARIANT,
        originStart: START,
        originEnd: START,
        integrity,
        // @ts-expect-error intentional forbidden key
        bodyHash: "deadbeefdeadbeefdeadbeefdeadbeef",
      }),
    ).rejects.toBeInstanceOf(ForecastEvaluationPersistDeniedError);

    await expect(
      persistForecastEvaluation({
        tenant: { ...TENANT, storeId: null },
        locationId: LOCATION,
        variantId: VARIANT,
        originStart: START,
        originEnd: START,
        integrity,
      }),
    ).rejects.toBeInstanceOf(ForecastEvaluationPersistDeniedError);
  });

  it("rejects foreign integrity grain vs TenantContext", async () => {
    const integrity = acceptedIntegrity();
    const foreign = {
      ...integrity,
      grain: {
        ...integrity.grain,
        organizationId: "6100b000-0000-4000-8000-000000000099",
      },
    } as HistoricalEvidenceIntegrityResult;

    await expect(
      persistForecastEvaluation({
        tenant: TENANT,
        locationId: LOCATION,
        variantId: VARIANT,
        originStart: START,
        originEnd: START,
        integrity: foreign,
      }),
    ).rejects.toBeInstanceOf(ForecastEvaluationPersistValidationError);
  });

  it("maps RPC body conflict and malformed responses", async () => {
    const integrity = acceptedIntegrity();

    await expect(
      persistForecastEvaluation(
        {
          tenant: TENANT,
          locationId: LOCATION,
          variantId: VARIANT,
          originStart: shiftForecastDate(START, 10),
          originEnd: shiftForecastDate(START, 12),
          lookbackDays: 7,
          integrity,
        },
        mockClient(() => ({
          data: null,
          error: {
            message:
              "forecast evaluation persistence EVALUATION_IDEMPOTENCY_BODY_CONFLICT",
          },
        })),
      ),
    ).rejects.toBeInstanceOf(ForecastEvaluationPersistConflictError);

    await expect(
      persistForecastEvaluation(
        {
          tenant: TENANT,
          locationId: LOCATION,
          variantId: VARIANT,
          originStart: shiftForecastDate(START, 10),
          originEnd: shiftForecastDate(START, 12),
          lookbackDays: 7,
          integrity,
        },
        mockClient(() => ({
          data: { ok: true, disposition: "created" },
          error: null,
        })),
      ),
    ).rejects.toBeInstanceOf(ForecastEvaluationPersistValidationError);

    await expect(
      persistForecastEvaluation(
        {
          tenant: TENANT,
          locationId: LOCATION,
          variantId: VARIANT,
          originStart: shiftForecastDate(START, 10),
          originEnd: shiftForecastDate(START, 12),
          lookbackDays: 7,
          integrity,
        },
        mockClient(() => ({
          data: null,
          error: {
            message:
              "Could not find the function public.persist_forecast_evaluation_result",
          },
        })),
      ),
    ).rejects.toBeInstanceOf(ForecastEvaluationPersistUnavailableError);
  });

  it("rejects approval claims in RPC responses", async () => {
    const integrity = acceptedIntegrity();

    await expect(
      persistForecastEvaluation(
        {
          tenant: TENANT,
          locationId: LOCATION,
          variantId: VARIANT,
          originStart: shiftForecastDate(START, 10),
          originEnd: shiftForecastDate(START, 12),
          lookbackDays: 7,
          integrity,
        },
        mockClient(() => ({
          data: {
            ok: true,
            disposition: "created",
            evaluationRunId: RUN_ID,
            isScoredEvaluation: true,
            claimsProductionApproval: true,
            claimsM7NumericEligibility: false,
            algorithmApproved: false,
          },
          error: null,
        })),
      ),
    ).rejects.toBeInstanceOf(ForecastEvaluationPersistValidationError);
  });
});
