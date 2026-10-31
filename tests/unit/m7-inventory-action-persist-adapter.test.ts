import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("server-only", () => ({}));

import type { InventoryActionEvidence } from "@/lib/commerce-domain/types";

import {
  buildInventoryActionPersistPayload,
  InventoryActionPersistConflictError,
  InventoryActionPersistDeniedError,
  InventoryActionPersistTimeoutError,
  InventoryActionPersistUnavailableError,
  InventoryActionPersistValidationError,
  M7_PERSISTENCE_CONTRACT_HARNESS_SOURCE_CLASS_V1,
  persistInventoryActionRecommendation,
  type InventoryActionPersistClient,
  type PersistInventoryActionRecommendationInput,
} from "@/lib/persistence/persist-inventory-action";

import type { TenantContext } from "@/lib/tenancy/types";

const ORG = "7100c000-0000-4000-8000-000000000001";
const STORE = "7100c000-0000-4000-8000-000000000002";
const LOCATION = "7100c000-0000-4000-8000-000000000003";
const VARIANT = "7100c000-0000-4000-8000-000000000005";
const USER = "7100c000-0000-4000-8000-000000000007";
const ACTION_ID = "7100c000-0000-4000-8000-0000000000a1";

const TENANT: TenantContext = {
  userId: USER,
  organizationId: ORG,
  role: "owner",
  storeId: STORE,
};

function evidence(
  overrides: Partial<InventoryActionEvidence> = {},
): InventoryActionEvidence {
  return {
    availableQuantity: 2,
    incomingQuantity: 0,
    demandVelocity: 1.5,
    daysOfStock: 1,
    leadTimeDays: 7,
    safetyStockUnits: 3,
    reorderPointUnits: 10,
    targetStockUnits: 20,
    inventoryAgeDays: 12,
    forecastExpectedDemandUnits: null,
    dataQualityScore: 0.9,
    reasonCodes: ["REORDER_QUANTITY_POSITIVE", "BELOW_REORDER_POINT"],
    ...overrides,
  };
}

function baseInput(
  overrides: Partial<PersistInventoryActionRecommendationInput> = {},
): PersistInventoryActionRecommendationInput {
  return {
    tenant: TENANT,
    locationId: LOCATION,
    variantId: VARIANT,
    decisionAsOfDate: "2026-10-30",
    pinnedTimeZone: "UTC",
    actionType: "REORDER",
    compatibleSecondaryActionTypes: [],
    priority: "high",
    recommendedQuantity: 12,
    recommendedActionDate: "2026-10-30",
    confidence: "medium",
    evidenceSnapshot: evidence(),
    incomingStateKnown: true,
    evidenceSourceClass: M7_PERSISTENCE_CONTRACT_HARNESS_SOURCE_CLASS_V1,
    metricDate: "2026-10-30",
    metricAlgorithmVersion: "sku-daily-metrics-v1",
    metricSourceWatermark: "2026-10-30T12:00:00.000Z",
    configurationVersion: "m7-persistence-harness-config-v1",
    decisionReproducibilityFingerprint: "abcd1234",
    ...overrides,
  };
}

function mockClient(
  handler: (fn: string, args: Record<string, unknown>) => {
    data: unknown;
    error: { code?: string; message: string } | null;
  },
): InventoryActionPersistClient {
  return {
    rpc: async (fn, args) => handler(fn, args),
  };
}

function okResponse(
  disposition: "created" | "replayed",
  payload: {
    decisionBodyHash: string;
    evidenceProvenanceFingerprint: string;
  },
) {
  return {
    ok: true,
    disposition,
    inventoryActionId: ACTION_ID,
    decisionBodyHash: payload.decisionBodyHash,
    evidenceProvenanceFingerprint: payload.evidenceProvenanceFingerprint,
    claimsMerchantFacing: false,
    claimsProductionForecastApproval: false,
    claimsM7ProductionEligibility: false,
    algorithmApproved: false,
    isScoredMerchantDecision: false,
  };
}

describe("M7.2c dormant inventory action persist adapter", () => {
  it("persists a valid dormant harness request", async () => {
    const input = baseInput();
    const expectedPayload = buildInventoryActionPersistPayload({
      grain: {
        organizationId: ORG,
        storeId: STORE,
        locationId: LOCATION,
        variantId: VARIANT,
      },
      input,
    });

    const captured: { payload: Record<string, unknown> | null } = {
      payload: null,
    };

    const client = mockClient((fn, args) => {
      expect(fn).toBe("persist_inventory_action_recommendation");
      expect(args.p_organization_id).toBe(ORG);
      expect(args.p_store_id).toBe(STORE);
      expect(args.p_location_id).toBe(LOCATION);
      expect(args.p_variant_id).toBe(VARIANT);
      captured.payload = args.p_payload as Record<string, unknown>;
      return {
        data: okResponse("created", expectedPayload),
        error: null,
      };
    });

    const result = await persistInventoryActionRecommendation(input, client);

    expect(result.disposition).toBe("created");
    expect(result.inventoryActionId).toBe(ACTION_ID);
    expect(result.claimsMerchantFacing).toBe(false);
    expect(result.claimsM7ProductionEligibility).toBe(false);
    expect(result.payload.forecastRunId).toBeNull();
    expect(result.payload.evidenceSourceClass).toBe(
      M7_PERSISTENCE_CONTRACT_HARNESS_SOURCE_CLASS_V1,
    );
    expect(captured.payload?.decisionBodyHash).toBe(
      expectedPayload.decisionBodyHash,
    );
    expect(String(captured.payload?.decisionBodyHash)).toHaveLength(64);
    expect(captured.payload?.organizationId).toBe(ORG);
  });

  it("maps identical replay dispositions", async () => {
    const input = baseInput();
    const payload = buildInventoryActionPersistPayload({
      grain: {
        organizationId: ORG,
        storeId: STORE,
        locationId: LOCATION,
        variantId: VARIANT,
      },
      input,
    });

    const client = mockClient(() => ({
      data: okResponse("replayed", payload),
      error: null,
    }));

    const result = await persistInventoryActionRecommendation(input, client);
    expect(result.disposition).toBe("replayed");
    expect(result.inventoryActionId).toBe(ACTION_ID);
  });

  it("maps same-identity body conflict errors", async () => {
    const client = mockClient(() => ({
      data: null,
      error: {
        message: "DECISION_IDEMPOTENCY_BODY_CONFLICT",
      },
    }));

    await expect(
      persistInventoryActionRecommendation(baseInput(), client),
    ).rejects.toBeInstanceOf(InventoryActionPersistConflictError);
  });

  it("rejects client-supplied organization overrides and trust keys", async () => {
    await expect(
      persistInventoryActionRecommendation({
        ...baseInput(),
        organizationId: "forged",
      } as never),
    ).rejects.toBeInstanceOf(InventoryActionPersistDeniedError);

    await expect(
      persistInventoryActionRecommendation({
        ...baseInput(),
        fixtureAttestation: "m7-controlled-local-fixture-v1",
      } as never),
    ).rejects.toBeInstanceOf(InventoryActionPersistDeniedError);

    await expect(
      persistInventoryActionRecommendation({
        ...baseInput(),
        claimsMerchantFacing: true,
      } as never),
    ).rejects.toBeInstanceOf(InventoryActionPersistDeniedError);
  });

  it("rejects missing tenant store and null location/variant", async () => {
    await expect(
      persistInventoryActionRecommendation(
        baseInput({
          tenant: { ...TENANT, storeId: null },
        }),
      ),
    ).rejects.toBeInstanceOf(InventoryActionPersistDeniedError);

    await expect(
      persistInventoryActionRecommendation(
        baseInput({
          locationId: "",
        }),
      ),
    ).rejects.toBeInstanceOf(InventoryActionPersistValidationError);
  });

  it("rejects HEALTHY, invalid quantities, and WATCH without reasons", async () => {
    await expect(
      persistInventoryActionRecommendation({
        ...baseInput(),
        actionType: "HEALTHY",
        recommendedQuantity: null,
      } as never),
    ).rejects.toBeInstanceOf(InventoryActionPersistValidationError);

    await expect(
      persistInventoryActionRecommendation(
        baseInput({
          recommendedQuantity: -1,
        }),
      ),
    ).rejects.toBeInstanceOf(InventoryActionPersistValidationError);

    await expect(
      persistInventoryActionRecommendation(
        baseInput({
          actionType: "WATCH",
          recommendedQuantity: null,
          evidenceSnapshot: evidence({ reasonCodes: [] }),
        }),
      ),
    ).rejects.toBeInstanceOf(InventoryActionPersistValidationError);

    await expect(
      persistInventoryActionRecommendation(
        baseInput({
          actionType: "WATCH",
          recommendedQuantity: 3,
          evidenceSnapshot: evidence({
            reasonCodes: ["MATERIAL_UNCERTAINTY"],
          }),
        }),
      ),
    ).rejects.toBeInstanceOf(InventoryActionPersistValidationError);
  });

  it("rejects fixture, reserved M5, and unknown source classes", async () => {
    await expect(
      persistInventoryActionRecommendation({
        ...baseInput(),
        evidenceSourceClass: "controlled_fixture_only",
      } as never),
    ).rejects.toBeInstanceOf(InventoryActionPersistValidationError);

    await expect(
      persistInventoryActionRecommendation({
        ...baseInput(),
        evidenceSourceClass: "m5_sku_daily_metric_bound_v1",
      } as never),
    ).rejects.toBeInstanceOf(InventoryActionPersistValidationError);
  });

  it("fails closed on malformed RPC responses and maps timeout/permission", async () => {
    const input = baseInput();
    const payload = buildInventoryActionPersistPayload({
      grain: {
        organizationId: ORG,
        storeId: STORE,
        locationId: LOCATION,
        variantId: VARIANT,
      },
      input,
    });

    await expect(
      persistInventoryActionRecommendation(
        input,
        mockClient(() => ({
          data: { ok: true, disposition: "created" },
          error: null,
        })),
      ),
    ).rejects.toBeInstanceOf(InventoryActionPersistValidationError);

    await expect(
      persistInventoryActionRecommendation(
        input,
        mockClient(() => ({
          data: {
            ...okResponse("created", payload),
            claimsMerchantFacing: true,
          },
          error: null,
        })),
      ),
    ).rejects.toBeInstanceOf(InventoryActionPersistValidationError);

    await expect(
      persistInventoryActionRecommendation(
        input,
        mockClient(() => ({
          data: {
            ...okResponse("created", payload),
            decisionBodyHash:
              "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
          },
          error: null,
        })),
      ),
    ).rejects.toBeInstanceOf(InventoryActionPersistValidationError);

    await expect(
      persistInventoryActionRecommendation(
        input,
        mockClient(() => ({
          data: null,
          error: { code: "57014", message: "statement timeout" },
        })),
      ),
    ).rejects.toBeInstanceOf(InventoryActionPersistTimeoutError);

    await expect(
      persistInventoryActionRecommendation(
        input,
        mockClient(() => ({
          data: null,
          error: { code: "42501", message: "permission denied" },
        })),
      ),
    ).rejects.toBeInstanceOf(InventoryActionPersistDeniedError);

    await expect(
      persistInventoryActionRecommendation(
        input,
        mockClient(() => ({
          data: null,
          error: {
            code: "42883",
            message: "function persist_inventory_action_recommendation does not exist",
          },
        })),
      ),
    ).rejects.toBeInstanceOf(InventoryActionPersistUnavailableError);
  });

  it("builds distinct provenance fingerprints when watermark changes", () => {
    const grain = {
      organizationId: ORG,
      storeId: STORE,
      locationId: LOCATION,
      variantId: VARIANT,
    };

    const first = buildInventoryActionPersistPayload({
      grain,
      input: baseInput(),
    });
    const second = buildInventoryActionPersistPayload({
      grain,
      input: baseInput({
        metricSourceWatermark: "2026-10-30T18:00:00.000Z",
        recommendedQuantity: 15,
      }),
    });

    expect(first.evidenceProvenanceFingerprint).not.toBe(
      second.evidenceProvenanceFingerprint,
    );
    expect(first.decisionBodyHash).not.toBe(second.decisionBodyHash);
  });
});
