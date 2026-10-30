import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("server-only", () => ({}));

import {
  ForecastSkuDemandLoaderDeniedError,
  ForecastSkuDemandLoaderTimeoutError,
  ForecastSkuDemandLoaderUnavailableError,
  ForecastSkuDemandLoaderValidationError,
  loadForecastSkuDemand,
  type ForecastSkuDemandLoaderClient,
  type LoadForecastSkuDemandInput,
} from "@/lib/persistence/load-forecast-sku-demand";

import type { TenantContext } from "@/lib/tenancy/types";

const ORG = "61007000-0000-4000-8000-000000000001";
const STORE = "61007000-0000-4000-8000-000000000002";
const LOCATION = "61007000-0000-4000-8000-000000000003";
const VARIANT = "61007000-0000-4000-8000-000000000005";
const AS_OF = "2026-07-01";

const TENANT: TenantContext = {
  userId: "61007000-0000-4000-8000-000000000007",
  organizationId: ORG,
  role: "owner",
  storeId: STORE,
};

function baseInput(
  overrides: Partial<LoadForecastSkuDemandInput> = {},
): LoadForecastSkuDemandInput {
  return {
    tenant: TENANT,
    locationId: LOCATION,
    variantId: VARIANT,
    forecastAsOf: AS_OF,
    lookbackDays: 7,
    ...overrides,
  };
}

function snapshotPayload(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    ok: true,
    timeZone: "UTC",
    forecastAsOf: AS_OF,
    lookbackDays: 7,
    inputStartDate: "2026-06-25",
    inputEndDate: AS_OF,
    sourceToken: "0123456789abcdef0123456789abcdef",
    orders: [
      {
        id: "ord-1",
        organizationId: ORG,
        storeId: STORE,
        status: "completed",
        orderedAt: "2026-07-01T12:00:00.000Z",
      },
    ],
    orderItems: [
      {
        id: "item-1",
        organizationId: ORG,
        storeId: STORE,
        orderId: "ord-1",
        variantId: VARIANT,
        locationId: LOCATION,
        quantity: 2,
      },
    ],
    returnRefunds: [],
    inventorySnapshots: [
      {
        id: "inv-1",
        organizationId: ORG,
        storeId: STORE,
        locationId: LOCATION,
        variantId: VARIANT,
        observedAt: "2026-07-01T18:00:00.000Z",
        availableQuantity: 5,
      },
    ],
    promotionEvidence: [
      {
        evidenceId: "promo-1",
        organizationId: ORG,
        storeId: STORE,
        locationId: null,
        variantId: null,
        localDate: AS_OF,
        state: "none",
        trust: "verified_merchant_attestation",
        source: "merchant:attestation",
        observedAt: "2026-07-02T00:00:00.000Z",
        version: 1,
        invalidatedAt: null,
        supersedesEvidenceId: null,
      },
    ],
    coverageEvidence: [
      {
        evidenceId: "cov-orders",
        organizationId: ORG,
        storeId: STORE,
        locationId: null,
        variantId: null,
        localDate: AS_OF,
        stream: "orders",
        coverage: "complete",
        trust: "verified_merchant_attestation",
        source: "merchant:attestation",
        asOf: "2026-07-02T00:00:00.000Z",
        observedAt: "2026-07-02T00:00:00.000Z",
        version: 1,
        invalidatedAt: null,
        supersedesEvidenceId: null,
        closureId: "closure-orders",
        pendingCorrection: false,
      },
      {
        evidenceId: "cov-returns",
        organizationId: ORG,
        storeId: STORE,
        locationId: LOCATION,
        variantId: VARIANT,
        localDate: AS_OF,
        stream: "returns",
        coverage: "complete",
        trust: "verified_merchant_attestation",
        source: "merchant:attestation",
        asOf: "2026-07-02T00:00:00.000Z",
        observedAt: "2026-07-02T00:00:00.000Z",
        version: 1,
        invalidatedAt: null,
        supersedesEvidenceId: null,
        closureId: "closure-returns",
        pendingCorrection: false,
      },
    ],
    pendingCorrections: [],
    ...overrides,
  };
}

function rpcClient(
  impl: (fn: string, args: Record<string, unknown>) => Promise<{
    data: unknown;
    error: { code?: string; message: string } | null;
  }>,
): ForecastSkuDemandLoaderClient {
  return {
    rpc: vi.fn(impl),
  };
}

describe("M6 P2c.2 forecast sku demand loader", () => {
  it("loads via one RPC and returns forecast plus freshness-limited provenance", async () => {
    const client = rpcClient(async (fn, args) => {
      expect(fn).toBe("forecast_sku_demand_source_snapshot");
      expect(args).toEqual({
        p_organization_id: ORG,
        p_store_id: STORE,
        p_location_id: LOCATION,
        p_variant_id: VARIANT,
        p_forecast_as_of: AS_OF,
        p_lookback_days: 7,
      });
      return { data: snapshotPayload(), error: null };
    });

    const result = await loadForecastSkuDemand(baseInput(), client);

    expect(result.grain).toEqual({
      organizationId: ORG,
      storeId: STORE,
      locationId: LOCATION,
      variantId: VARIANT,
    });
    expect(result.forecast.organizationId).toBe(ORG);
    expect(result.forecast.forecastAsOf).toBe(AS_OF);
    expect(result.provenance.sourceToken).toBe(
      "0123456789abcdef0123456789abcdef",
    );
    expect(result.provenance.trustedCompleteDatesUsed).toBe(false);
    expect(result.provenance.pendingCorrectionFenceApplied).toBe(true);
    expect(result.provenance.sourceTokenFreshness).toMatch(
      /does not prove currency/i,
    );
    expect(result.provenance.pendingCorrectionCount).toBe(0);
    expect(client.rpc).toHaveBeenCalledTimes(1);
  });

  it("fences pendingCorrection stamps so completeness cannot stay true", async () => {
    const client = rpcClient(async () => ({
      data: snapshotPayload({
        coverageEvidence: [
          {
            evidenceId: "cov-orders",
            organizationId: ORG,
            storeId: STORE,
            locationId: null,
            variantId: null,
            localDate: AS_OF,
            stream: "orders",
            coverage: "complete",
            trust: "verified_merchant_attestation",
            source: "merchant:attestation",
            asOf: "2026-07-02T00:00:00.000Z",
            observedAt: "2026-07-02T00:00:00.000Z",
            version: 1,
            invalidatedAt: null,
            supersedesEvidenceId: null,
            closureId: "closure-orders",
            pendingCorrection: true,
          },
          {
            evidenceId: "cov-returns",
            organizationId: ORG,
            storeId: STORE,
            locationId: LOCATION,
            variantId: VARIANT,
            localDate: AS_OF,
            stream: "returns",
            coverage: "complete",
            trust: "verified_merchant_attestation",
            source: "merchant:attestation",
            asOf: "2026-07-02T00:00:00.000Z",
            observedAt: "2026-07-02T00:00:00.000Z",
            version: 1,
            invalidatedAt: null,
            supersedesEvidenceId: null,
            closureId: "closure-returns",
            pendingCorrection: false,
          },
        ],
        pendingCorrections: [
          {
            eventId: 9,
            organizationId: ORG,
            storeId: STORE,
            stream: "orders",
            localDate: AS_OF,
            locationId: null,
            variantId: null,
            businessAt: "2026-07-01T08:00:00.000Z",
            arrivedAt: "2026-07-03T00:00:00.000Z",
            sourceTable: "order_items",
            sourceOp: "update",
          },
        ],
      }),
      error: null,
    }));

    const result = await loadForecastSkuDemand(baseInput(), client);
    const asOfFact = result.forecast.classifiedDays.find(
      (day) => day.date === AS_OF,
    );

    expect(result.provenance.pendingCorrectionCount).toBe(1);
    expect(asOfFact?.disposition).toBe("unusable");
    expect(asOfFact?.reasonCode).toBe("DATA_INCOMPLETE");
  });

  it("fences null-scope pending list entries even when stamp is false", async () => {
    const client = rpcClient(async () => ({
      data: snapshotPayload({
        pendingCorrections: [
          {
            eventId: 11,
            organizationId: ORG,
            storeId: STORE,
            stream: "returns",
            localDate: AS_OF,
            locationId: null,
            variantId: null,
            businessAt: "2026-06-30T12:00:00.000Z",
            arrivedAt: "2026-07-01T12:00:00.000Z",
            sourceTable: "return_refunds",
            sourceOp: "insert",
          },
        ],
      }),
      error: null,
    }));

    const result = await loadForecastSkuDemand(baseInput(), client);
    const asOfFact = result.forecast.classifiedDays.find(
      (day) => day.date === AS_OF,
    );

    expect(asOfFact?.disposition).toBe("unusable");
    expect(asOfFact?.reasonCode).toBe("DATA_INCOMPLETE");
  });

  it("rejects foreign grain commerce in the RPC payload", async () => {
    const client = rpcClient(async () => ({
      data: snapshotPayload({
        orders: [
          {
            id: "foreign",
            organizationId: "61007000-0000-4000-8000-000000000099",
            storeId: STORE,
            status: "completed",
            orderedAt: "2026-07-01T12:00:00.000Z",
          },
        ],
      }),
      error: null,
    }));

    await expect(loadForecastSkuDemand(baseInput(), client)).rejects.toBeInstanceOf(
      ForecastSkuDemandLoaderValidationError,
    );
  });

  it("rejects client identity overrides and missing store scope", async () => {
    const unused = rpcClient(async () => {
      throw new Error("rpc must not run for denied inputs");
    });

    await expect(
      loadForecastSkuDemand(
        {
          ...baseInput(),
          organizationId: ORG,
        } as LoadForecastSkuDemandInput,
        unused,
      ),
    ).rejects.toBeInstanceOf(ForecastSkuDemandLoaderDeniedError);

    await expect(
      loadForecastSkuDemand(
        baseInput({
          tenant: { ...TENANT, storeId: null },
        }),
        unused,
      ),
    ).rejects.toBeInstanceOf(ForecastSkuDemandLoaderDeniedError);
  });

  it("rejects trustedCompleteDates in the snapshot payload", async () => {
    const client = rpcClient(async () => ({
      data: snapshotPayload({
        trustedCompleteDates: [AS_OF],
      }),
      error: null,
    }));

    await expect(loadForecastSkuDemand(baseInput(), client)).rejects.toBeInstanceOf(
      ForecastSkuDemandLoaderValidationError,
    );
  });

  it("rejects malformed evidence and invalid lookback", async () => {
    const unused = rpcClient(async () => {
      throw new Error("rpc must not run for invalid lookback");
    });

    await expect(
      loadForecastSkuDemand(baseInput({ lookbackDays: 0 }), unused),
    ).rejects.toBeInstanceOf(ForecastSkuDemandLoaderValidationError);

    const client = rpcClient(async () => ({
      data: snapshotPayload({
        coverageEvidence: [
          {
            evidenceId: "bad",
            organizationId: ORG,
            storeId: STORE,
            locationId: null,
            variantId: null,
            localDate: AS_OF,
            stream: "orders",
            coverage: "complete",
            trust: "untrusted_guess",
            source: "x",
            asOf: "2026-07-02T00:00:00.000Z",
            observedAt: "2026-07-02T00:00:00.000Z",
            version: 1,
            invalidatedAt: null,
            supersedesEvidenceId: null,
            closureId: null,
            pendingCorrection: false,
          },
        ],
      }),
      error: null,
    }));

    await expect(loadForecastSkuDemand(baseInput(), client)).rejects.toBeInstanceOf(
      ForecastSkuDemandLoaderValidationError,
    );
  });

  it("maps lock and statement timeouts fail-closed", async () => {
    const lockClient = rpcClient(async () => ({
      data: null,
      error: { code: "55P03", message: "canceling statement due to lock timeout" },
    }));

    await expect(
      loadForecastSkuDemand(baseInput(), lockClient),
    ).rejects.toMatchObject({
      name: "ForecastSkuDemandLoaderTimeoutError",
      sqlstate: "55P03",
    } satisfies Partial<ForecastSkuDemandLoaderTimeoutError>);

    const stmtClient = rpcClient(async () => ({
      data: null,
      error: {
        code: "57014",
        message: "canceling statement due to statement timeout",
      },
    }));

    await expect(
      loadForecastSkuDemand(baseInput(), stmtClient),
    ).rejects.toMatchObject({
      sqlstate: "57014",
    });
  });

  it("maps missing RPC capability and permission denials", async () => {
    const missing = rpcClient(async () => ({
      data: null,
      error: {
        code: "P0001",
        message:
          "forecast sku demand snapshot requires correction outbox and fence helpers",
      },
    }));

    await expect(
      loadForecastSkuDemand(baseInput(), missing),
    ).rejects.toBeInstanceOf(ForecastSkuDemandLoaderUnavailableError);

    const denied = rpcClient(async () => ({
      data: null,
      error: { code: "42501", message: "permission denied for function" },
    }));

    await expect(
      loadForecastSkuDemand(baseInput(), denied),
    ).rejects.toBeInstanceOf(ForecastSkuDemandLoaderDeniedError);
  });

  it("maps RPC scope validation errors without inventing completeness", async () => {
    const client = rpcClient(async () => ({
      data: null,
      error: {
        code: "P0001",
        message: "forecast sku demand snapshot scope error: invalid_iana_timezone",
      },
    }));

    await expect(
      loadForecastSkuDemand(baseInput(), client),
    ).rejects.toBeInstanceOf(ForecastSkuDemandLoaderValidationError);
  });
});
