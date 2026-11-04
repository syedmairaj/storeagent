import {
  describe,
  expect,
  it,
} from "vitest";

import {
  bindPublishedForecastEvidence,
  isPe1aTrustedPublishedForecastBindingSuccess,
  M6_PE1A_BINDING_ATTESTATION_V1,
  M6_PE1A_CHECK_TIME_FRESHNESS_LIMITATION_V1,
  M6_PE1A_PUBLISHED_FORECAST_BINDER_VERSION_V1,
  type Pe1aPublishedForecastBindRequest,
} from "@/lib/decision-engine/published-forecast-eligibility";

const ORG = "8100e000-0000-4000-8000-000000000001";
const STORE = "8100e000-0000-4000-8000-000000000002";
const LOCATION = "8100e000-0000-4000-8000-000000000003";
const VARIANT = "8100e000-0000-4000-8000-000000000004";
const PUBLICATION_ID = "8100e000-0000-4000-8000-000000000011";
const RUN_ID = "8100e000-0000-4000-8000-000000000012";
const FORECAST_ID = "8100e000-0000-4000-8000-000000000013";
const TOKEN = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const AS_OF = "2026-10-14";

function grain() {
  return {
    organizationId: ORG,
    storeId: STORE,
    locationId: LOCATION,
    variantId: VARIANT,
  };
}

function eligibleEvidence(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    disposition: "eligible",
    m7NumericEligible: true,
    dailyDemand: 2.5,
    claimsPostCommitFreshness: false,
    freshnessLimitation: M6_PE1A_CHECK_TIME_FRESHNESS_LIMITATION_V1,
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

function missEvidence(
  disposition: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    disposition,
    m7NumericEligible: false,
    dailyDemand: null,
    claimsPostCommitFreshness: false,
    freshnessLimitation: M6_PE1A_CHECK_TIME_FRESHNESS_LIMITATION_V1,
    grain: grain(),
    publicationId: PUBLICATION_ID,
    forecastRunId: RUN_ID,
    skuForecastId: FORECAST_ID,
    sourceToken: TOKEN,
    forecastAsOf: AS_OF,
    lookbackDays: 90,
    confidence: "low",
    mode: "standard",
    dataSufficiency: "limited",
    ...overrides,
  };
}

function request(
  overrides: Partial<Pe1aPublishedForecastBindRequest> & {
    evidence?: unknown;
  } = {},
): Pe1aPublishedForecastBindRequest {
  const { evidence, ...rest } = overrides;
  return {
    binderVersion: M6_PE1A_PUBLISHED_FORECAST_BINDER_VERSION_V1,
    bindingAttestation: M6_PE1A_BINDING_ATTESTATION_V1,
    trustedGrain: grain(),
    // Preserve explicit null evidence (?? would replace it).
    evidence: Object.prototype.hasOwnProperty.call(overrides, "evidence")
      ? evidence
      : eligibleEvidence(),
    claimsMerchantFacing: false,
    claimsProductionForecastApproval: false,
    claimsM7ProductionEligibility: false,
    algorithmApproved: false,
    ...rest,
  };
}

describe("M6-PE1.a bindPublishedForecastEvidence", () => {
  it("keeps technically eligible evidence production-ineligible and preserves observed demand", () => {
    const first = bindPublishedForecastEvidence(request());
    const second = bindPublishedForecastEvidence(request());

    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }

    expect(first.forecastEligibility).toBe("ineligible");
    expect(first.forecastExpectedDemandUnits).toBeNull();
    expect(first.forecastConfidence).toBe("low");
    expect(first.observed.technicalNumericEligible).toBe(true);
    expect(first.observed.dailyDemandObserved).toBe(2.5);
    expect(first.observed.disposition).toBe("eligible");
    expect(first.observed.forecastRunId).toBe(RUN_ID.toLowerCase());
    expect(first.observed.sourceToken).toBe(TOKEN);
    expect(first.observed.claimsPostCommitFreshness).toBe(false);
    expect(first.reasonCodes).toEqual(["FORECAST_UNAVAILABLE"]);
    expect(first.mappingNotes).toContain("FORECAST_FORCED_INELIGIBLE");
    expect(first.mappingNotes).toContain("TECHNICAL_NUMERIC_SIGNAL_OBSERVED");
    expect(first.mappingNotes).toContain("AGE_POLICY_NOT_APPROVED");
    expect(first.mappingNotes).toContain("OBSERVED_DEMAND_NOT_DECISION_INPUT");
    expect(first.provenance.m7Eligible).toBe(false);
    expect(first.provenance.forecastEligibility).toBe("ineligible");
    expect(first.provenance.productionDecisionCreationEligible).toBe(false);
    expect(first.provenance.claimsProductionForecastApproval).toBe(false);
    expect(first.provenance.claimsM7ProductionEligibility).toBe(false);
    expect(first.provenance.algorithmApproved).toBe(false);
    expect(first.productionCreateBlockedUntil).toContain(
      "M6_PRODUCTION_FORECAST_ELIGIBILITY_APPROVED",
    );
    expect(first.warnings).toContain("NOT_m7_eligible");
    expect(isPe1aTrustedPublishedForecastBindingSuccess(first)).toBe(true);

    // Determinism: same logical payload → same decision-facing fields.
    expect(second.ok).toBe(true);
    if (!second.ok) {
      return;
    }
    expect(second.forecastEligibility).toBe(first.forecastEligibility);
    expect(second.forecastExpectedDemandUnits).toBe(
      first.forecastExpectedDemandUnits,
    );
    expect(second.forecastConfidence).toBe(first.forecastConfidence);
    expect(second.reasonCodes).toEqual(first.reasonCodes);
    expect(second.observed.dailyDemandObserved).toBe(
      first.observed.dailyDemandObserved,
    );
    expect(second.grain).toEqual(first.grain);

    // Immutability of minted success.
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.grain)).toBe(true);
    expect(Object.isFrozen(first.observed)).toBe(true);
    expect(Object.isFrozen(first.provenance)).toBe(true);
  });

  it("maps miss dispositions to ineligible decision fields without inventing demand", () => {
    const cases: Array<{
      disposition: string;
      reason: "FORECAST_UNAVAILABLE" | "FORECAST_CONFIDENCE_LOW";
      note: string;
    }> = [
      {
        disposition: "ABSENT",
        reason: "FORECAST_UNAVAILABLE",
        note: "DISPOSITION_ABSENT",
      },
      {
        disposition: "STALE",
        reason: "FORECAST_UNAVAILABLE",
        note: "DISPOSITION_STALE",
      },
      {
        disposition: "PENDING_CORRECTION",
        reason: "FORECAST_UNAVAILABLE",
        note: "DISPOSITION_PENDING_CORRECTION",
      },
      {
        disposition: "FORECAST_UNAVAILABLE",
        reason: "FORECAST_UNAVAILABLE",
        note: "DISPOSITION_FORECAST_UNAVAILABLE",
      },
      {
        disposition: "FORECAST_CONFIDENCE_LOW",
        reason: "FORECAST_CONFIDENCE_LOW",
        note: "DISPOSITION_FORECAST_CONFIDENCE_LOW",
      },
    ];

    for (const row of cases) {
      const result = bindPublishedForecastEvidence(
        request({ evidence: missEvidence(row.disposition) }),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) {
        continue;
      }
      expect(result.forecastEligibility).toBe("ineligible");
      expect(result.forecastExpectedDemandUnits).toBeNull();
      expect(result.forecastConfidence).toBe("low");
      expect(result.observed.technicalNumericEligible).toBe(false);
      expect(result.observed.dailyDemandObserved).toBeNull();
      expect(result.reasonCodes).toEqual([row.reason]);
      expect(result.mappingNotes).toContain(row.note);
      expect(result.mappingNotes).toContain("FORECAST_FORCED_INELIGIBLE");
    }
  });

  it("rejects forged reader results and tenant mismatches", () => {
    expect(
      bindPublishedForecastEvidence(
        request({
          evidence: eligibleEvidence({
            claimsPostCommitFreshness: true,
          }),
        }),
      ),
    ).toMatchObject({
      ok: false,
      code: "FRESHNESS_CLAIM_REJECTED",
    });

    expect(
      bindPublishedForecastEvidence(
        request({
          evidence: eligibleEvidence({
            freshnessLimitation: "forged age approved",
          }),
        }),
      ),
    ).toMatchObject({
      ok: false,
      code: "FRESHNESS_CLAIM_REJECTED",
    });

    expect(
      bindPublishedForecastEvidence(
        request({
          evidence: eligibleEvidence({
            grain: {
              ...grain(),
              organizationId: "8100e000-0000-4000-8000-000000009999",
            },
          }),
        }),
      ),
    ).toMatchObject({
      ok: false,
      code: "GRAIN_MISMATCH",
    });

    expect(
      bindPublishedForecastEvidence(
        request({
          evidence: eligibleEvidence({
            m7Eligible: true,
            forecastExpectedDemandUnits: 99,
          }),
        }),
      ),
    ).toMatchObject({
      ok: false,
      code: "EVIDENCE_UNTRUSTED",
    });

    expect(
      bindPublishedForecastEvidence(
        request({
          evidence: eligibleEvidence({
            disposition: "eligible",
            m7NumericEligible: false,
          }),
        }),
      ),
    ).toMatchObject({
      ok: false,
      code: "CONFLICTING_EVIDENCE",
    });

    expect(
      bindPublishedForecastEvidence(
        request({
          evidence: missEvidence("STALE", { dailyDemand: 1 }),
        }),
      ),
    ).toMatchObject({
      ok: false,
      code: "CONFLICTING_EVIDENCE",
    });

    expect(
      bindPublishedForecastEvidence(
        request({
          evidence: eligibleEvidence({
            sourceToken: "not-a-token",
          }),
        }),
      ),
    ).toMatchObject({
      ok: false,
      code: "IDENTITY_INVALID",
    });

    expect(
      bindPublishedForecastEvidence(
        request({
          evidence: null,
        }),
      ),
    ).toMatchObject({
      ok: false,
      code: "EVIDENCE_MALFORMED",
    });
  });

  it("rejects production trust claims and forged success objects", () => {
    expect(
      bindPublishedForecastEvidence(
        request({
          claimsProductionForecastApproval: true as false,
        }),
      ),
    ).toMatchObject({
      ok: false,
      code: "PRODUCTION_TRUST_CLAIM_REJECTED",
    });

    expect(
      bindPublishedForecastEvidence(
        request({
          bindingAttestation: "forged" as typeof M6_PE1A_BINDING_ATTESTATION_V1,
        }),
      ),
    ).toMatchObject({
      ok: false,
      code: "BINDING_ATTESTATION_INVALID",
    });

    expect(
      bindPublishedForecastEvidence(
        {
          ...request(),
          productionEligibilityAttestation: "forged-production-ok",
        } as unknown as Pe1aPublishedForecastBindRequest,
      ),
    ).toMatchObject({
      ok: false,
      code: "PRODUCTION_TRUST_CLAIM_REJECTED",
    });

    const forgedSuccess = {
      ok: true,
      binderVersion: M6_PE1A_PUBLISHED_FORECAST_BINDER_VERSION_V1,
      forecastEligibility: "ineligible",
      forecastExpectedDemandUnits: null,
      forecastConfidence: "low",
      provenance: {
        m7Eligible: false,
        forecastEligibility: "ineligible",
        productionDecisionCreationEligible: false,
      },
    };
    expect(isPe1aTrustedPublishedForecastBindingSuccess(forgedSuccess)).toBe(
      false,
    );

    const minted = bindPublishedForecastEvidence(request());
    expect(isPe1aTrustedPublishedForecastBindingSuccess(minted)).toBe(true);
    if (!minted.ok) {
      return;
    }
    expect(minted.provenance.evidenceAuthenticity).toBe(
      "fresh_reader_shaped_structural_only",
    );
    expect(minted.provenance.evidenceScope).toBe(
      "m6_published_forecast_preparation_only",
    );
  });

  it("rejects WeakSet-unminted clones, spreads, and serialized copies", () => {
    const minted = bindPublishedForecastEvidence(request());
    expect(minted.ok).toBe(true);
    if (!minted.ok) {
      return;
    }

    expect(isPe1aTrustedPublishedForecastBindingSuccess(minted)).toBe(true);

    const spreadClone = { ...minted };
    expect(isPe1aTrustedPublishedForecastBindingSuccess(spreadClone)).toBe(
      false,
    );

    const assigned = Object.assign({}, minted);
    expect(isPe1aTrustedPublishedForecastBindingSuccess(assigned)).toBe(false);

    const jsonClone = JSON.parse(JSON.stringify(minted)) as unknown;
    expect(isPe1aTrustedPublishedForecastBindingSuccess(jsonClone)).toBe(
      false,
    );

    const structured = structuredClone(minted);
    expect(isPe1aTrustedPublishedForecastBindingSuccess(structured)).toBe(
      false,
    );
  });

  it("isolates bound results from later input mutation and freezes nested evidence", () => {
    const evidence = eligibleEvidence({ dailyDemand: 4 });
    const trustedGrain = grain();
    const result = bindPublishedForecastEvidence(
      request({ evidence, trustedGrain }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    // Mutate originals after bind — bound snapshot must not change.
    (evidence as { dailyDemand: number }).dailyDemand = 999;
    (evidence as { disposition: string }).disposition = "STALE";
    (evidence as { sourceToken: string }).sourceToken = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    trustedGrain.organizationId = "8100e000-0000-4000-8000-000000009999";

    expect(result.observed.dailyDemandObserved).toBe(4);
    expect(result.observed.disposition).toBe("eligible");
    expect(result.observed.sourceToken).toBe(TOKEN);
    expect(result.grain.organizationId).toBe(ORG.toLowerCase());
    expect(result.forecastExpectedDemandUnits).toBeNull();
    expect(result.forecastEligibility).toBe("ineligible");

    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.observed)).toBe(true);
    expect(Object.isFrozen(result.provenance)).toBe(true);
    expect(Object.isFrozen(result.grain)).toBe(true);
    expect(Object.isFrozen(result.reasonCodes)).toBe(true);
    expect(Object.isFrozen(result.mappingNotes)).toBe(true);

    expect(() => {
      (result.observed as { dailyDemandObserved: number }).dailyDemandObserved =
        123;
    }).toThrow();
    expect(() => {
      (result.provenance as { m7Eligible: boolean }).m7Eligible = true;
    }).toThrow();
    expect(() => {
      (result.grain as { storeId: string }).storeId =
        "8100e000-0000-4000-8000-000000009998";
    }).toThrow();

    expect(result.observed.dailyDemandObserved).toBe(4);
    expect(result.provenance.m7Eligible).toBe(false);
    expect(result.grain.storeId).toBe(STORE.toLowerCase());
  });

  it("rejects request-surface decision-field bypass keys", () => {
    const withBypass = {
      ...request(),
      forecastExpectedDemandUnits: 12,
    } as unknown as Pe1aPublishedForecastBindRequest;

    expect(bindPublishedForecastEvidence(withBypass)).toMatchObject({
      ok: false,
      code: "PRODUCTION_TRUST_CLAIM_REJECTED",
    });
  });
});
