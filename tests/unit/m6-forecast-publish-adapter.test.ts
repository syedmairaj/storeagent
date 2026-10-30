import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("server-only", () => ({}));

import {
  ForecastPublishDeniedError,
  ForecastPublishForeignGrainError,
  ForecastPublishPendingCorrectionError,
  ForecastPublishStaleTokenError,
  ForecastPublishTimeoutError,
  ForecastPublishUnavailableError,
  ForecastPublishValidationError,
  publishForecastSkuDemand,
  type ForecastPublishClient,
} from "@/lib/persistence/publish-forecast-sku-demand";

import type { TenantContext } from "@/lib/tenancy/types";

const ORG = "6100c000-0000-4000-8000-000000000001";
const STORE = "6100c000-0000-4000-8000-000000000002";
const LOCATION = "6100c000-0000-4000-8000-000000000003";
const VARIANT = "6100c000-0000-4000-8000-000000000005";
const FOREIGN_ORG = "6100c000-0000-4000-8000-000000000099";
const RUN_ID = "6100c000-0000-4000-8000-0000000000a1";
const FORECAST_ID = "6100c000-0000-4000-8000-0000000000a2";
const PUBLICATION_ID = "6100c000-0000-4000-8000-0000000000a3";
const TOKEN = "abcdef0123456789abcdef0123456789";

const TENANT: TenantContext = {
  userId: "6100c000-0000-4000-8000-000000000007",
  organizationId: ORG,
  role: "owner",
  storeId: STORE,
};

function baseInput() {
  return {
    tenant: TENANT,
    locationId: LOCATION,
    variantId: VARIANT,
    forecastRunId: RUN_ID,
  };
}

function runRow(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: RUN_ID,
    organization_id: ORG,
    store_id: STORE,
    location_id: LOCATION,
    variant_id: VARIANT,
    status: "completed",
    ...overrides,
  };
}

function publishedOk(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    ok: true,
    disposition: "published",
    outcome: "published",
    publicationId: PUBLICATION_ID,
    forecastRunId: RUN_ID,
    skuForecastId: FORECAST_ID,
    sourceToken: TOKEN,
    m7Eligible: false,
    persistClaimsPostCommitFreshness: false,
    pointerAdvanced: true,
    supersedesPublicationId: null,
    ...overrides,
  };
}

function replayedOk(): Record<string, unknown> {
  return {
    ok: true,
    disposition: "replayed",
    outcome: "published",
    publicationId: PUBLICATION_ID,
    forecastRunId: RUN_ID,
    skuForecastId: FORECAST_ID,
    sourceToken: TOKEN,
    m7Eligible: false,
    persistClaimsPostCommitFreshness: false,
    pointerAdvanced: false,
  };
}

function withheldOk(
  reason: string,
): Record<string, unknown> {
  return {
    ok: true,
    disposition: "withheld",
    outcome: "withheld",
    withholdReason: reason,
    publicationId: PUBLICATION_ID,
    forecastRunId: RUN_ID,
    skuForecastId: FORECAST_ID,
    sourceToken: TOKEN,
    m7Eligible: false,
    persistClaimsPostCommitFreshness: false,
    pointerAdvanced: false,
  };
}

function mockClient(options: {
  run?: Record<string, unknown> | null;
  runError?: { code?: string; message: string };
  rpcData?: unknown;
  rpcError?: { code?: string; message: string };
  onRpc?: (fn: string, args: Record<string, unknown>) => void;
}): ForecastPublishClient {
  const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
    options.onRpc?.(fn, args);
    return {
      data: options.rpcData ?? null,
      error: options.rpcError ?? null,
    };
  });

  const maybeSingle = vi.fn(async () => ({
    data: options.run === undefined ? runRow() : options.run,
    error: options.runError ?? null,
  }));

  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));

  return { rpc, from } as unknown as ForecastPublishClient;
}

describe("M6 P3d.2 forecast publish adapter", () => {
  it("publishes through RPC once and returns published/current flags without M7", async () => {
    let rpcCalls = 0;
    const client = mockClient({
      rpcData: publishedOk(),
      onRpc(fn, args) {
        rpcCalls += 1;
        expect(fn).toBe("publish_sku_forecast");
        expect(args).toEqual({ p_forecast_run_id: RUN_ID });
      },
    });

    const result = await publishForecastSkuDemand(baseInput(), client);

    expect(rpcCalls).toBe(1);
    expect(result.disposition).toBe("published");
    expect(result.outcome).toBe("published");
    expect(result.published).toBe(true);
    expect(result.isCurrent).toBe(true);
    expect(result.pointerAdvanced).toBe(true);
    expect(result.m7Eligible).toBe(false);
    expect(result.publicationClaimsPostCommitFreshness).toBe(false);
    expect(result.persistClaimsPostCommitFreshness).toBe(false);
    expect(result.withholdReason).toBeNull();
    expect(result.publicationId).toBe(PUBLICATION_ID);
    expect(result.forecastRunId).toBe(RUN_ID);
    expect(result.skuForecastId).toBe(FORECAST_ID);
    expect(result.sourceToken).toBe(TOKEN);
    expect(result.grain).toEqual({
      organizationId: ORG,
      storeId: STORE,
      locationId: LOCATION,
      variantId: VARIANT,
    });
    expect(result.freshnessLimitation).toMatch(/not prove/i);
  });

  it("preserves replayed disposition without claiming current", async () => {
    const result = await publishForecastSkuDemand(
      baseInput(),
      mockClient({ rpcData: replayedOk() }),
    );

    expect(result.disposition).toBe("replayed");
    expect(result.outcome).toBe("published");
    expect(result.published).toBe(true);
    expect(result.isCurrent).toBe(false);
    expect(result.pointerAdvanced).toBe(false);
    expect(result.m7Eligible).toBe(false);
  });

  it("returns withheld for non-stale eligibility failures without claiming current", async () => {
    const result = await publishForecastSkuDemand(
      baseInput(),
      mockClient({ rpcData: withheldOk("NULL_DEMAND") }),
    );

    expect(result.disposition).toBe("withheld");
    expect(result.outcome).toBe("withheld");
    expect(result.published).toBe(false);
    expect(result.isCurrent).toBe(false);
    expect(result.withholdReason).toBe("NULL_DEMAND");
    expect(result.m7Eligible).toBe(false);
  });

  it("rejects malformed and contradictory RPC shapes", async () => {
    await expect(
      publishForecastSkuDemand(
        baseInput(),
        mockClient({
          rpcData: publishedOk({ disposition: "mystery" }),
        }),
      ),
    ).rejects.toBeInstanceOf(ForecastPublishValidationError);

    await expect(
      publishForecastSkuDemand(
        baseInput(),
        mockClient({
          rpcData: publishedOk({
            outcome: "withheld",
            withholdReason: "NULL_DEMAND",
          }),
        }),
      ),
    ).rejects.toBeInstanceOf(ForecastPublishValidationError);

    await expect(
      publishForecastSkuDemand(
        baseInput(),
        mockClient({
          rpcData: publishedOk({ pointerAdvanced: false }),
        }),
      ),
    ).rejects.toBeInstanceOf(ForecastPublishValidationError);

    await expect(
      publishForecastSkuDemand(
        baseInput(),
        mockClient({
          rpcData: publishedOk({ m7Eligible: true }),
        }),
      ),
    ).rejects.toBeInstanceOf(ForecastPublishValidationError);

    await expect(
      publishForecastSkuDemand(
        baseInput(),
        mockClient({
          rpcData: publishedOk({
            persistClaimsPostCommitFreshness: true,
          }),
        }),
      ),
    ).rejects.toBeInstanceOf(ForecastPublishValidationError);

    await expect(
      publishForecastSkuDemand(
        baseInput(),
        mockClient({
          rpcData: {
            ...withheldOk("NULL_DEMAND"),
            pointerAdvanced: true,
          },
        }),
      ),
    ).rejects.toBeInstanceOf(ForecastPublishValidationError);
  });

  it("rejects client-controlled overrides", async () => {
    const unused = mockClient({
      rpcData: publishedOk(),
    });

    await expect(
      publishForecastSkuDemand(
        {
          ...baseInput(),
          organizationId: ORG,
        } as never,
        unused,
      ),
    ).rejects.toBeInstanceOf(ForecastPublishDeniedError);

    await expect(
      publishForecastSkuDemand(
        {
          ...baseInput(),
          trustedCompleteDates: ["2026-07-01"],
        } as never,
        unused,
      ),
    ).rejects.toBeInstanceOf(ForecastPublishDeniedError);

    expect(unused.rpc).not.toHaveBeenCalled();
  });

  it("fails closed on foreign grain before RPC", async () => {
    const client = mockClient({
      run: runRow({ organization_id: FOREIGN_ORG }),
      rpcData: publishedOk(),
    });

    await expect(
      publishForecastSkuDemand(baseInput(), client),
    ).rejects.toBeInstanceOf(ForecastPublishForeignGrainError);

    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("fails closed on missing run / foreign unknown id before RPC", async () => {
    const client = mockClient({
      run: null,
      rpcData: publishedOk(),
    });

    await expect(
      publishForecastSkuDemand(baseInput(), client),
    ).rejects.toBeInstanceOf(ForecastPublishForeignGrainError);

    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("fails closed on stale token and pending correction without retry", async () => {
    let staleCalls = 0;
    await expect(
      publishForecastSkuDemand(
        baseInput(),
        mockClient({
          rpcData: withheldOk("STALE_SOURCE_TOKEN"),
          onRpc() {
            staleCalls += 1;
          },
        }),
      ),
    ).rejects.toBeInstanceOf(ForecastPublishStaleTokenError);
    expect(staleCalls).toBe(1);

    let pendingCalls = 0;
    await expect(
      publishForecastSkuDemand(
        baseInput(),
        mockClient({
          rpcData: withheldOk("PENDING_CORRECTION"),
          onRpc() {
            pendingCalls += 1;
          },
        }),
      ),
    ).rejects.toBeInstanceOf(ForecastPublishPendingCorrectionError);
    expect(pendingCalls).toBe(1);
  });

  it("fails closed on timeout, missing RPC, and authorization denial", async () => {
    await expect(
      publishForecastSkuDemand(
        baseInput(),
        mockClient({
          rpcError: { code: "57014", message: "statement timeout" },
        }),
      ),
    ).rejects.toBeInstanceOf(ForecastPublishTimeoutError);

    await expect(
      publishForecastSkuDemand(
        baseInput(),
        mockClient({
          rpcError: {
            message:
              "Could not find the function public.publish_sku_forecast",
          },
        }),
      ),
    ).rejects.toBeInstanceOf(ForecastPublishUnavailableError);

    await expect(
      publishForecastSkuDemand(
        baseInput(),
        mockClient({
          rpcError: {
            code: "42501",
            message: "permission denied for function publish_sku_forecast",
          },
        }),
      ),
    ).rejects.toBeInstanceOf(ForecastPublishDeniedError);
  });
});
