import {
  describe,
  expect,
  it,
} from "vitest";

import type { TenantContext } from "@/lib/tenancy/types";

import {
  applyLateCorrectionToIssuedCoverage,
  assertIssuanceReplayCompatible,
  invalidateIssuedCoverage,
  issueMerchantAttestationCoverage,
  issueMerchantAttestationPromotion,
  issueTrustedProviderCoverage,
  issueTrustedProviderPromotion,
  verifiedProviderContextFromTrustedImport,
  type CoverageIssuanceRequest,
  type PromotionIssuanceRequest,
  type VerifiedProviderIssuanceContext,
} from "@/lib/forecasting/evidence-issuance";

const PROVIDER: VerifiedProviderIssuanceContext = {
  organizationId: "org-a",
  storeId: "store-a",
  integrationId: "int-csv-1",
  provider: "csv",
};

const OWNER: TenantContext = {
  userId: "user-owner",
  organizationId: "org-a",
  role: "owner",
  storeId: "store-a",
};

const DAY = "2026-06-15";
const AS_OF = "2026-06-16T00:00:00.000Z";

function promoReq(
  overrides: Partial<PromotionIssuanceRequest> = {},
): PromotionIssuanceRequest {
  return {
    localDate: DAY,
    state: "none",
    observedAt: AS_OF,
    idempotencyKey: "promo-1",
    ...overrides,
  };
}

function coverageReq(
  overrides: Partial<CoverageIssuanceRequest> = {},
): CoverageIssuanceRequest {
  return {
    localDate: DAY,
    stream: "orders",
    coverage: "partial",
    observedAt: AS_OF,
    asOf: AS_OF,
    idempotencyKey: "cov-1",
    ...overrides,
  };
}

function completeClosure(
  overrides: Partial<CoverageIssuanceRequest> = {},
): CoverageIssuanceRequest {
  return coverageReq({
    coverage: "complete",
    closure: {
      kind: "explicit_day_stream_closure",
      watermarkAsOf: AS_OF,
      closureId: "close-orders-1",
    },
    ...overrides,
  });
}

describe("M6 P2b.2a trusted evidence issuance", () => {
  it("stamps trusted_provider from issuance path and ignores identity overrides", () => {
    const issued = issueTrustedProviderPromotion(PROVIDER, promoReq());

    expect(issued.evidence.trust).toBe("trusted_provider");
    expect(issued.evidence.organizationId).toBe(PROVIDER.organizationId);
    expect(issued.evidence.storeId).toBe(PROVIDER.storeId);
    expect(issued.issuance.integrationId).toBe(PROVIDER.integrationId);
    expect(issued.issuance.actorUserId).toBeNull();
    expect(issued.evidence.source).toContain("provider:csv:integration:");
  });

  it("stamps verified_merchant_attestation for owner/admin only", () => {
    const owner = issueMerchantAttestationPromotion(OWNER, promoReq({
      state: "promotion",
      idempotencyKey: "m-promo",
    }));

    expect(owner.evidence.trust).toBe("verified_merchant_attestation");
    expect(owner.issuance.actorUserId).toBe(OWNER.userId);
    expect(owner.evidence.organizationId).toBe(OWNER.organizationId);

    const admin: TenantContext = {
      ...OWNER,
      userId: "user-admin",
      role: "admin",
    };

    expect(
      issueMerchantAttestationPromotion(admin, promoReq({
        idempotencyKey: "m-admin",
      })).evidence.trust,
    ).toBe("verified_merchant_attestation");

    for (const role of ["analyst", "operator"] as const) {
      expect(() =>
        issueMerchantAttestationPromotion(
          { ...OWNER, role },
          promoReq({ idempotencyKey: `m-${role}` }),
        ),
      ).toThrow(/owner or admin/);
    }
  });

  it("rejects self-assigned trust and tenant identity in payloads", () => {
    expect(() =>
      issueTrustedProviderPromotion(
        PROVIDER,
        {
          ...promoReq(),
          trust: "verified_merchant_attestation",
        } as unknown as PromotionIssuanceRequest,
      ),
    ).toThrow(/trust/);

    expect(() =>
      issueMerchantAttestationCoverage(
        OWNER,
        {
          ...coverageReq(),
          organizationId: "org-b",
          storeId: "store-b",
        } as unknown as CoverageIssuanceRequest,
      ),
    ).toThrow(/organizationId|storeId/);

    expect(() =>
      issueTrustedProviderCoverage(
        PROVIDER,
        {
          ...coverageReq(),
          syncRunStatus: "completed",
        } as unknown as CoverageIssuanceRequest,
      ),
    ).toThrow(/syncRunStatus/);
  });

  it("rejects cross-org merchant context misuse via store-less or foreign binding helper", () => {
    expect(() =>
      verifiedProviderContextFromTrustedImport({
        organizationId: "org-a",
        storeId: null,
        integrationId: "int-1",
        provider: "csv",
      }),
    ).toThrow(/store-scoped/);

    expect(() =>
      issueMerchantAttestationPromotion(
        { ...OWNER, storeId: null },
        promoReq(),
      ),
    ).toThrow(/store/);

    const foreignOwner: TenantContext = {
      ...OWNER,
      organizationId: "org-b",
    };

    const foreign = issueMerchantAttestationPromotion(
      foreignOwner,
      promoReq({ idempotencyKey: "foreign" }),
    );

    expect(foreign.evidence.organizationId).toBe("org-b");
    expect(foreign.evidence.organizationId).not.toBe(PROVIDER.organizationId);
  });

  it("requires explicit closure for complete and keeps incomplete CSV partial", () => {
    expect(() =>
      issueTrustedProviderCoverage(
        PROVIDER,
        coverageReq({ coverage: "complete" }),
      ),
    ).toThrow(/explicit_day_stream_closure/);

    expect(() =>
      issueTrustedProviderCoverage(
        PROVIDER,
        coverageReq({
          coverage: "complete",
          closure: {
            kind: "sync_run_completed" as "explicit_day_stream_closure",
            watermarkAsOf: AS_OF,
            closureId: "sync-1",
          },
        }),
      ),
    ).toThrow(/explicit_day_stream_closure/);

    const partial = issueTrustedProviderCoverage(
      PROVIDER,
      coverageReq({
        coverage: "partial",
        idempotencyKey: "csv-partial",
      }),
    );

    expect(partial.evidence.coverage).toBe("partial");
    expect(partial.issuance.closureId).toBeNull();

    const complete = issueTrustedProviderCoverage(
      PROVIDER,
      completeClosure({ idempotencyKey: "csv-complete" }),
    );

    expect(complete.evidence.coverage).toBe("complete");
    expect(complete.issuance.closureId).toBe("close-orders-1");
  });

  it("rejects mismatched closure watermark and closure on partial", () => {
    expect(() =>
      issueTrustedProviderCoverage(
        PROVIDER,
        completeClosure({
          asOf: "2026-06-16T01:00:00.000Z",
        }),
      ),
    ).toThrow(/watermarkAsOf/);

    expect(() =>
      issueTrustedProviderCoverage(
        PROVIDER,
        coverageReq({
          coverage: "partial",
          closure: {
            kind: "explicit_day_stream_closure",
            watermarkAsOf: AS_OF,
            closureId: "x",
          },
        }),
      ),
    ).toThrow(/partial coverage/);
  });

  it("supports optional location/variant narrowing without silent widening", () => {
    const narrow = issueTrustedProviderPromotion(
      PROVIDER,
      promoReq({
        locationId: "loc-a",
        variantId: "var-a",
        idempotencyKey: "narrow",
      }),
    );

    expect(narrow.evidence.locationId).toBe("loc-a");
    expect(narrow.evidence.variantId).toBe("var-a");

    const wide = issueTrustedProviderPromotion(
      PROVIDER,
      promoReq({ idempotencyKey: "wide" }),
    );

    expect(wide.evidence.locationId).toBeNull();
    expect(wide.evidence.variantId).toBeNull();
    expect(wide.evidence.evidenceId).not.toBe(narrow.evidence.evidenceId);
  });

  it("replays deterministically and rejects conflicting duplicate keys", () => {
    const first = issueTrustedProviderCoverage(
      PROVIDER,
      completeClosure({ idempotencyKey: "replay-1" }),
    );
    const second = issueTrustedProviderCoverage(
      PROVIDER,
      completeClosure({ idempotencyKey: "replay-1" }),
    );

    expect(second).toEqual(first);
    expect(() => assertIssuanceReplayCompatible(first, second)).not.toThrow();

    const conflict = issueTrustedProviderCoverage(
      PROVIDER,
      completeClosure({
        idempotencyKey: "replay-1",
        stream: "returns",
      }),
    );

    expect(() => assertIssuanceReplayCompatible(first, conflict)).toThrow(
      /conflicting/,
    );
  });

  it("invalidates coverage on late correction; fresh evidence required to restore", () => {
    const issued = issueMerchantAttestationCoverage(
      OWNER,
      completeClosure({
        stream: "returns",
        idempotencyKey: "ret-1",
        closure: {
          kind: "explicit_day_stream_closure",
          watermarkAsOf: AS_OF,
          closureId: "close-returns-1",
        },
      }),
    );

    const invalidated = applyLateCorrectionToIssuedCoverage(
      issued,
      [
        {
          organizationId: "org-a",
          storeId: "store-a",
          locationId: "loc-a",
          variantId: "var-a",
          localDate: DAY,
          observedAt: "2026-06-16T12:00:00.000Z",
          stream: "returns",
        },
      ],
      "2026-06-16T12:00:00.000Z",
    );

    expect(invalidated.evidence.invalidatedAt).toBe(
      "2026-06-16T12:00:00.000Z",
    );
    expect(invalidated.evidence.trust).toBe("verified_merchant_attestation");

    expect(() =>
      invalidateIssuedCoverage(invalidated, "2026-06-17T00:00:00.000Z"),
    ).toThrow(/already invalidated/);

    const restored = issueMerchantAttestationCoverage(
      OWNER,
      completeClosure({
        stream: "returns",
        idempotencyKey: "ret-1",
        version: 2,
        supersedesEvidenceId: issued.evidence.evidenceId,
        asOf: "2026-06-17T00:00:00.000Z",
        observedAt: "2026-06-17T00:00:00.000Z",
        closure: {
          kind: "explicit_day_stream_closure",
          watermarkAsOf: "2026-06-17T00:00:00.000Z",
          closureId: "close-returns-2",
        },
      }),
    );

    expect(restored.evidence.invalidatedAt).toBeNull();
    expect(restored.evidence.version).toBe(2);
    expect(restored.evidence.supersedesEvidenceId).toBe(
      issued.evidence.evidenceId,
    );
    expect(restored.evidence.evidenceId).not.toBe(issued.evidence.evidenceId);
  });

  it("does not treat provider identity or sync success as day completeness", () => {
    const withoutClosure = issueTrustedProviderCoverage(
      PROVIDER,
      coverageReq({ coverage: "partial", idempotencyKey: "no-close" }),
    );

    expect(withoutClosure.evidence.coverage).toBe("partial");

    const incompleteComplete: CoverageIssuanceRequest = {
      localDate: DAY,
      stream: "orders",
      coverage: "complete",
      observedAt: AS_OF,
      asOf: AS_OF,
      idempotencyKey: "fake-complete",
    };

    expect(() =>
      issueTrustedProviderCoverage(PROVIDER, incompleteComplete),
    ).toThrow(/explicit_day_stream_closure/);
  });
});
