import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("server-only", () => ({}));

import {
  FreshPublishedForecastDeniedError,
  FreshPublishedForecastTimeoutError,
  FreshPublishedForecastUnavailableError,
  FreshPublishedForecastValidationError,
  readFreshPublishedSkuForecast,
  type FreshPublishedForecastClient,
} from "@/lib/persistence/read-fresh-published-sku-forecast";

import type { TenantContext } from "@/lib/tenancy/types";

const ORG = "6100d000-0000-4000-8000-000000000001";
const STORE = "6100d000-0000-4000-8000-000000000002";
const LOCATION = "6100d000-0000-4000-8000-000000000003";
const VARIANT = "6100d000-0000-4000-8000-000000000005";
const RUN_ID = "6100d000-0000-4000-8000-0000000000a1";
const FORECAST_ID = "6100d000-0000-4000-8000-0000000000a2";
const PUBLICATION_ID = "6100d000-0000-4000-8000-0000000000a3";
const TOKEN = "abcdef0123456789abcdef0123456789";
const AS_OF = "2026-07-01";

const FRESHNESS =
  "read_fresh_published_sku_forecast proves source_token identity and publication gates at check time only; it does not prove post-return freshness or acceptable forecast age. M7 owns forecast-age policy and must revalidate before acting.";

const TENANT: TenantContext = {
  userId: "6100d000-0000-4000-8000-000000000007",
  organizationId: ORG,
  role: "owner",
  storeId: STORE,
};

function baseInput() {
  return {
    tenant: TENANT,
    locationId: LOCATION,
    variantId: VARIANT,
  };
}

function grain() {
  return {
    organizationId: ORG,
    storeId: STORE,
    locationId: LOCATION,
    variantId: VARIANT,
  };
}

function eligibleOk(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    ok: true,
    disposition: "eligible",
    m7NumericEligible: true,
    dailyDemand: 2,
    claimsPostCommitFreshness: false,
    freshnessLimitation: FRESHNESS,
    grain: grain(),
    publicationId: PUBLICATION_ID,
    forecastRunId: RUN_ID,
    skuForecastId: FORECAST_ID,
    sourceToken: TOKEN,
    forecastAsOf: AS_OF,
    lookbackDays: 90,
    confidence: "medium",
    mode: "standard",
    dataSufficiency: "sufficient",
    ...overrides,
  };
}

function missOk(
  disposition: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    ok: true,
    disposition,
    m7NumericEligible: false,
    dailyDemand: null,
    claimsPostCommitFreshness: false,
    freshnessLimitation: FRESHNESS,
    grain: grain(),
    publicationId: PUBLICATION_ID,
    forecastRunId: RUN_ID,
    skuForecastId: FORECAST_ID,
    sourceToken: TOKEN,
    forecastAsOf: AS_OF,
    lookbackDays: 90,
    confidence: "low",
    mode: "standard",
    dataSufficiency: "sufficient",
    ...overrides,
  };
}

function rpcClient(
  impl: (fn: string, args: Record<string, unknown>) => Promise<{
    data: unknown;
    error: { code?: string; message: string } | null;
  }>,
): FreshPublishedForecastClient {
  return { rpc: vi.fn(impl) };
}

describe("M6 P3d.3 fresh published forecast reader adapter", () => {
  it("returns eligible numeric demand for medium/high confidence", async () => {
    const client = rpcClient(async (fn, args) => {
      expect(fn).toBe("read_fresh_published_sku_forecast");
      expect(args).toEqual({
        p_organization_id: ORG,
        p_store_id: STORE,
        p_location_id: LOCATION,
        p_variant_id: VARIANT,
      });
      return { data: eligibleOk({ confidence: "high", dailyDemand: 0 }), error: null };
    });

    const result = await readFreshPublishedSkuForecast(baseInput(), client);
    expect(result.disposition).toBe("eligible");
    if (result.disposition !== "eligible") {
      throw new Error("expected eligible");
    }
    expect(result.m7NumericEligible).toBe(true);
    expect(result.dailyDemand).toBe(0);
    expect(result.confidence).toBe("high");
    expect(result.claimsPostCommitFreshness).toBe(false);
    expect(result.freshnessLimitation).toMatch(/forecast age/i);
    expect(client.rpc).toHaveBeenCalledTimes(1);
  });

  it("preserves typed misses with null dailyDemand", async () => {
    for (const disposition of [
      "ABSENT",
      "STALE",
      "PENDING_CORRECTION",
      "FORECAST_UNAVAILABLE",
      "FORECAST_CONFIDENCE_LOW",
    ]) {
      const result = await readFreshPublishedSkuForecast(
        baseInput(),
        rpcClient(async () => ({
          data: missOk(disposition, {
            publicationId: disposition === "ABSENT" ? null : PUBLICATION_ID,
            forecastRunId: disposition === "ABSENT" ? null : RUN_ID,
            skuForecastId: disposition === "ABSENT" ? null : FORECAST_ID,
            sourceToken: disposition === "ABSENT" ? null : TOKEN,
            forecastAsOf: disposition === "ABSENT" ? null : AS_OF,
            lookbackDays: disposition === "ABSENT" ? null : 90,
            confidence: disposition === "ABSENT" ? null : "low",
            mode: disposition === "ABSENT" ? null : "standard",
            dataSufficiency: disposition === "ABSENT" ? null : "sufficient",
          }),
          error: null,
        })),
      );

      expect(result.disposition).toBe(disposition);
      expect(result.m7NumericEligible).toBe(false);
      expect(result.dailyDemand).toBeNull();
    }
  });

  it("rejects client overrides and malformed/contradictory payloads", async () => {
    await expect(
      readFreshPublishedSkuForecast(
        { ...baseInput(), organizationId: ORG } as never,
        rpcClient(async () => {
          throw new Error("must not call rpc");
        }),
      ),
    ).rejects.toBeInstanceOf(FreshPublishedForecastDeniedError);

    await expect(
      readFreshPublishedSkuForecast(
        baseInput(),
        rpcClient(async () => ({
          data: eligibleOk({ m7NumericEligible: false }),
          error: null,
        })),
      ),
    ).rejects.toBeInstanceOf(FreshPublishedForecastValidationError);

    await expect(
      readFreshPublishedSkuForecast(
        baseInput(),
        rpcClient(async () => ({
          data: missOk("STALE", { dailyDemand: 1 }),
          error: null,
        })),
      ),
    ).rejects.toBeInstanceOf(FreshPublishedForecastValidationError);

    await expect(
      readFreshPublishedSkuForecast(
        baseInput(),
        rpcClient(async () => ({
          data: eligibleOk({
            grain: { ...grain(), organizationId: "6100d000-0000-4000-8000-000000000099" },
          }),
          error: null,
        })),
      ),
    ).rejects.toBeInstanceOf(FreshPublishedForecastValidationError);

    await expect(
      readFreshPublishedSkuForecast(
        baseInput(),
        rpcClient(async () => ({
          data: { ok: true, disposition: "mystery" },
          error: null,
        })),
      ),
    ).rejects.toBeInstanceOf(FreshPublishedForecastValidationError);
  });

  it("fails closed on timeout, missing RPC, and authorization denial", async () => {
    await expect(
      readFreshPublishedSkuForecast(
        baseInput(),
        rpcClient(async () => ({
          data: null,
          error: { code: "57014", message: "statement timeout" },
        })),
      ),
    ).rejects.toBeInstanceOf(FreshPublishedForecastTimeoutError);

    await expect(
      readFreshPublishedSkuForecast(
        baseInput(),
        rpcClient(async () => ({
          data: null,
          error: {
            message:
              "Could not find the function public.read_fresh_published_sku_forecast",
          },
        })),
      ),
    ).rejects.toBeInstanceOf(FreshPublishedForecastUnavailableError);

    await expect(
      readFreshPublishedSkuForecast(
        baseInput(),
        rpcClient(async () => ({
          data: null,
          error: {
            code: "42501",
            message: "permission denied for function read_fresh_published_sku_forecast",
          },
        })),
      ),
    ).rejects.toBeInstanceOf(FreshPublishedForecastDeniedError);
  });
});
