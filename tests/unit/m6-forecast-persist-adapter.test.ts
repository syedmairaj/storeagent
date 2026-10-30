import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("server-only", () => ({}));

import {
  FORECAST_CONFIGURATION_VERSION_V1,
  FORECAST_ORCHESTRATOR_VERSION_V1,
} from "@/lib/forecasting/orchestrate";

import { FORECAST_ALGORITHM_VERSIONS_V1 } from "@/lib/forecasting/reproducibility";

import type { LoadForecastSkuDemandResult } from "@/lib/persistence/load-forecast-sku-demand";

import {
  buildForecastPersistPayload,
  ForecastPersistConflictError,
  ForecastPersistDeniedError,
  ForecastPersistStaleTokenError,
  ForecastPersistTimeoutError,
  ForecastPersistUnavailableError,
  ForecastPersistValidationError,
  persistForecastSkuDemand,
  persistLoadedForecastSkuDemand,
  type ForecastPersistClient,
} from "@/lib/persistence/persist-forecast-sku-demand";

import type { TenantContext } from "@/lib/tenancy/types";

const ORG = "61009000-0000-4000-8000-000000000001";
const STORE = "61009000-0000-4000-8000-000000000002";
const LOCATION = "61009000-0000-4000-8000-000000000003";
const VARIANT = "61009000-0000-4000-8000-000000000005";
const AS_OF = "2026-07-01";
const TOKEN = "0123456789abcdef0123456789abcdef";
const RUN_ID = "61009000-0000-4000-8000-0000000000a1";
const FORECAST_ID = "61009000-0000-4000-8000-0000000000a2";

const TENANT: TenantContext = {
  userId: "61009000-0000-4000-8000-000000000007",
  organizationId: ORG,
  role: "owner",
  storeId: STORE,
};

function loadedResult(
  overrides: {
    dailyDemand?: number | null;
    mode?: "standard" | "limited_history" | "unavailable";
    sourceToken?: string;
  } = {},
): LoadForecastSkuDemandResult {
  const dailyDemand =
    overrides.dailyDemand === undefined ? null : overrides.dailyDemand;
  const mode = overrides.mode ?? "unavailable";

  return {
    grain: {
      organizationId: ORG,
      storeId: STORE,
      locationId: LOCATION,
      variantId: VARIANT,
    },
    forecast: {
      algorithmVersion: FORECAST_ORCHESTRATOR_VERSION_V1,
      configurationVersion: FORECAST_CONFIGURATION_VERSION_V1,
      algorithmVersions: FORECAST_ALGORITHM_VERSIONS_V1,
      organizationId: ORG,
      storeId: STORE,
      locationId: LOCATION,
      variantId: VARIANT,
      forecastAsOf: AS_OF,
      inputStartDate: "2026-06-25",
      inputEndDate: AS_OF,
      dailyDemand,
      mode,
      dataSufficiency: dailyDemand === null ? "insufficient" : "sufficient",
      confidence: dailyDemand === null ? "low" : "medium",
      weightedDailyDemand: dailyDemand,
      trendApplied: false,
      trendAdjustedDailyDemand: null,
      activeWindows: [],
      quality: {
        totalDays: 7,
        baselineUsableDays: dailyDemand === null ? 0 : 3,
        censoredDays: 0,
        promotionExcludedDays: 0,
        unusableDays: dailyDemand === null ? 7 : 4,
      },
      horizons: {
        algorithmVersion: "forecast-horizon-v1",
        dailyDemand,
        leadTimeDays: null,
        reviewPeriodDays: null,
        replenishmentHorizonDays: null,
        leadTimeDemandUnits: null,
        reviewPeriodDemandUnits: null,
        replenishmentDemandUnits: null,
        reasonCodes: ["LEAD_TIME_UNAVAILABLE"],
      },
      reproducibilityFingerprint: "abcd1234",
      reasonCodes: ["INSUFFICIENT_HISTORY"],
      classifiedDays: [
        {
          date: AS_OF,
          unitsSold: 0,
          disposition: "unusable",
          reasonCode: "DATA_INCOMPLETE",
        },
      ],
    },
    provenance: {
      rpc: "forecast_sku_demand_source_snapshot",
      sourceToken: overrides.sourceToken ?? TOKEN,
      timeZone: "UTC",
      forecastAsOf: AS_OF,
      lookbackDays: 7,
      inputStartDate: "2026-06-25",
      inputEndDate: AS_OF,
      pendingCorrectionCount: 0,
      pendingCorrectionFenceApplied: true,
      trustedCompleteDatesUsed: false,
      sourceTokenFreshness:
        "sourceToken proves the identity of rows included in the snapshot RPC statement only; it does not prove currency after the transaction commits.",
    },
  };
}

function snapshotPayload(): Record<string, unknown> {
  return {
    ok: true,
    timeZone: "UTC",
    forecastAsOf: AS_OF,
    lookbackDays: 7,
    inputStartDate: "2026-06-25",
    inputEndDate: AS_OF,
    sourceToken: TOKEN,
    orders: [],
    orderItems: [],
    returnRefunds: [],
    inventorySnapshots: [],
    promotionEvidence: [],
    coverageEvidence: [],
    pendingCorrections: [],
  };
}

function persistOk(
  disposition: "created" | "replayed",
): Record<string, unknown> {
  return {
    ok: true,
    disposition,
    forecastRunId: RUN_ID,
    skuForecastId: FORECAST_ID,
    sourceToken: TOKEN,
    status: "completed",
    persistClaimsPostCommitFreshness: false,
  };
}

function rpcClient(
  impl: (fn: string, args: Record<string, unknown>) => Promise<{
    data: unknown;
    error: { code?: string; message: string } | null;
  }>,
): ForecastPersistClient {
  return { rpc: vi.fn(impl) };
}

describe("M6 P3c forecast persist adapter", () => {
  it("maps complete forecast fields including nullable demand and provenance", () => {
    const loaded = loadedResult({ dailyDemand: null });
    const payload = buildForecastPersistPayload(loaded);

    expect(payload.dailyDemand).toBeNull();
    expect(payload.mode).toBe("unavailable");
    expect(payload.algorithmVersion).toBe(FORECAST_ORCHESTRATOR_VERSION_V1);
    expect(payload.configurationVersion).toBe(
      FORECAST_CONFIGURATION_VERSION_V1,
    );
    expect(payload.algorithmVersions).toEqual(FORECAST_ALGORITHM_VERSIONS_V1);
    expect(payload.reproducibilityFingerprint).toBe("abcd1234");
    expect(payload.classifiedDays).toEqual(loaded.forecast.classifiedDays);
    expect(payload.quality).toEqual(loaded.forecast.quality);
    expect(payload.horizons).toEqual(loaded.forecast.horizons);
    expect(payload.provenance).toMatchObject({
      sourceToken: TOKEN,
      trustedCompleteDatesUsed: false,
      historicalOnly: true,
      published: false,
      m7Eligible: false,
      persistClaimsPostCommitFreshness: false,
    });
    expect(payload).not.toHaveProperty("trustedCompleteDates");
    expect(payload).not.toHaveProperty("confidenceIntervals");
  });

  it("loads then persists through the trusted RPC and returns created disposition", async () => {
    const client = rpcClient(async (fn, args) => {
      if (fn === "forecast_sku_demand_source_snapshot") {
        return { data: snapshotPayload(), error: null };
      }

      expect(fn).toBe("persist_forecast_sku_demand_result");
      expect(args.p_organization_id).toBe(ORG);
      expect(args.p_store_id).toBe(STORE);
      expect(args.p_location_id).toBe(LOCATION);
      expect(args.p_variant_id).toBe(VARIANT);
      expect(args.p_forecast_as_of).toBe(AS_OF);
      expect(args.p_lookback_days).toBe(7);
      expect(args.p_source_token).toBe(TOKEN);
      expect(args.p_payload).toMatchObject({
        organizationId: ORG,
        dailyDemand: null,
        reproducibilityFingerprint: expect.any(String),
      });
      return { data: persistOk("created"), error: null };
    });

    const result = await persistForecastSkuDemand(
      {
        tenant: TENANT,
        locationId: LOCATION,
        variantId: VARIANT,
        forecastAsOf: AS_OF,
        lookbackDays: 7,
      },
      client,
    );

    expect(result.disposition).toBe("created");
    expect(result.forecastRunId).toBe(RUN_ID);
    expect(result.skuForecastId).toBe(FORECAST_ID);
    expect(result.published).toBe(false);
    expect(result.m7Eligible).toBe(false);
    expect(result.persistClaimsPostCommitFreshness).toBe(false);
    expect(result.forecast).toBe(result.load.forecast);
    expect(client.rpc).toHaveBeenCalledTimes(2);
  });

  it("distinguishes idempotent replay disposition", async () => {
    const client = rpcClient(async () => ({
      data: persistOk("replayed"),
      error: null,
    }));

    const result = await persistLoadedForecastSkuDemand(
      loadedResult(),
      client,
    );

    expect(result.disposition).toBe("replayed");
    expect(result.published).toBe(false);
  });

  it("rejects client-controlled overrides", async () => {
    const unused = rpcClient(async () => {
      throw new Error("rpc must not run");
    });

    await expect(
      persistForecastSkuDemand(
        {
          tenant: TENANT,
          locationId: LOCATION,
          variantId: VARIANT,
          forecastAsOf: AS_OF,
          sourceToken: TOKEN,
        } as never,
        unused,
      ),
    ).rejects.toBeInstanceOf(ForecastPersistDeniedError);

    await expect(
      persistForecastSkuDemand(
        {
          tenant: TENANT,
          locationId: LOCATION,
          variantId: VARIANT,
          forecastAsOf: AS_OF,
          trustedCompleteDates: ["2026-07-01"],
        } as never,
        unused,
      ),
    ).rejects.toBeInstanceOf(ForecastPersistDeniedError);
  });

  it("fails closed on stale token without silent retry", async () => {
    let calls = 0;
    const client = rpcClient(async () => {
      calls += 1;
      return {
        data: null,
        error: { message: "forecast persistence STALE_SOURCE_TOKEN" },
      };
    });

    await expect(
      persistLoadedForecastSkuDemand(loadedResult(), client),
    ).rejects.toBeInstanceOf(ForecastPersistStaleTokenError);

    expect(calls).toBe(1);
  });

  it("fails closed on body conflict, timeout, missing RPC, and malformed response", async () => {
    await expect(
      persistLoadedForecastSkuDemand(
        loadedResult(),
        rpcClient(async () => ({
          data: null,
          error: {
            message: "forecast persistence IDEMPOTENCY_BODY_CONFLICT",
          },
        })),
      ),
    ).rejects.toBeInstanceOf(ForecastPersistConflictError);

    await expect(
      persistLoadedForecastSkuDemand(
        loadedResult(),
        rpcClient(async () => ({
          data: null,
          error: { code: "57014", message: "statement timeout" },
        })),
      ),
    ).rejects.toBeInstanceOf(ForecastPersistTimeoutError);

    await expect(
      persistLoadedForecastSkuDemand(
        loadedResult(),
        rpcClient(async () => ({
          data: null,
          error: {
            message:
              "Could not find the function public.persist_forecast_sku_demand_result",
          },
        })),
      ),
    ).rejects.toBeInstanceOf(ForecastPersistUnavailableError);

    await expect(
      persistLoadedForecastSkuDemand(
        loadedResult(),
        rpcClient(async () => ({
          data: { ok: true, disposition: "mystery" },
          error: null,
        })),
      ),
    ).rejects.toBeInstanceOf(ForecastPersistValidationError);

    await expect(
      persistLoadedForecastSkuDemand(
        {
          ...loadedResult(),
          forecast: {
            ...loadedResult().forecast,
            organizationId: "61009000-0000-4000-8000-000000000099",
          },
        },
        rpcClient(async () => {
          throw new Error("must not call rpc for foreign grain");
        }),
      ),
    ).rejects.toBeInstanceOf(ForecastPersistValidationError);
  });
});
