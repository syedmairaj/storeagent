import {
  describe,
  expect,
  it,
} from "vitest";

import {
  evaluateCanaryForecastEligibilityPolicy,
  M6_PE1B_CANARY_ELIGIBILITY_POLICY_VERSION_V1,
  M6_PE1B_CANARY_POLICY_ATTESTATION_V1,
  type Pe1bCanaryAllowlistEntryV1,
  type Pe1bCanaryPolicyEvaluateRequest,
} from "@/lib/decision-engine/canary-forecast-eligibility-policy";
import {
  bindPublishedForecastEvidence,
  isPe1aTrustedPublishedForecastBindingSuccess,
  M6_PE1A_BINDING_ATTESTATION_V1,
  M6_PE1A_CHECK_TIME_FRESHNESS_LIMITATION_V1,
  M6_PE1A_PUBLISHED_FORECAST_BINDER_VERSION_V1,
  type Pe1aPublishedForecastBindingSuccess,
} from "@/lib/decision-engine/published-forecast-eligibility";

const ORG = "8100e000-0000-4000-8000-000000000001";
const STORE = "8100e000-0000-4000-8000-000000000002";
const LOCATION = "8100e000-0000-4000-8000-000000000003";
const VARIANT = "8100e000-0000-4000-8000-000000000004";
const OTHER_ORG = "8100e000-0000-4000-8000-000000009999";
const PUBLICATION_ID = "8100e000-0000-4000-8000-000000000011";
const RUN_ID = "8100e000-0000-4000-8000-000000000012";
const FORECAST_ID = "8100e000-0000-4000-8000-000000000013";
const TOKEN = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const AS_OF = "2026-10-14";

function grain(overrides: Partial<Record<string, string>> = {}) {
  return {
    organizationId: ORG,
    storeId: STORE,
    locationId: LOCATION,
    variantId: VARIANT,
    ...overrides,
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

function mintBinding(
  evidence: Record<string, unknown> = eligibleEvidence(),
): Pe1aPublishedForecastBindingSuccess {
  const result = bindPublishedForecastEvidence({
    binderVersion: M6_PE1A_PUBLISHED_FORECAST_BINDER_VERSION_V1,
    bindingAttestation: M6_PE1A_BINDING_ATTESTATION_V1,
    trustedGrain: grain(),
    evidence,
    claimsMerchantFacing: false,
    claimsProductionForecastApproval: false,
    claimsM7ProductionEligibility: false,
    algorithmApproved: false,
  });
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error("expected PE1.a bind success");
  }
  expect(isPe1aTrustedPublishedForecastBindingSuccess(result)).toBe(true);
  return result;
}

function allowlistEntry(
  overrides: Partial<Pe1bCanaryAllowlistEntryV1> = {},
): Pe1bCanaryAllowlistEntryV1 {
  return {
    organizationId: ORG,
    storeId: STORE,
    locationId: LOCATION,
    variantId: VARIANT,
    revokedAt: null,
    ...overrides,
  };
}

function policyRequest(
  overrides: Partial<Pe1bCanaryPolicyEvaluateRequest> & {
    binding?: Pe1aPublishedForecastBindingSuccess;
  } = {},
): Pe1bCanaryPolicyEvaluateRequest {
  const { binding: bindingOverride, ...rest } = overrides;
  const binding = bindingOverride ?? mintBinding();
  return {
    policyVersion: M6_PE1B_CANARY_ELIGIBILITY_POLICY_VERSION_V1,
    policyAttestation: M6_PE1B_CANARY_POLICY_ATTESTATION_V1,
    trustedGrain: grain(),
    evidenceAuthenticity: "fresh_reader_shaped_structural_only",
    canaryAllowlist: [allowlistEntry()],
    claimsMerchantFacing: false,
    claimsProductionForecastApproval: false,
    claimsM7ProductionEligibility: false,
    algorithmApproved: false,
    forecastAgePolicy: "unapproved",
    algorithmPinPolicy: "unapproved",
    productionEligibilityAttestation: null,
    ...rest,
    binding,
  };
}

describe("M6-PE1.b.1 evaluateCanaryForecastEligibilityPolicy", () => {
  it("keeps technically eligible allowlisted evidence production-ineligible", () => {
    const first = evaluateCanaryForecastEligibilityPolicy(policyRequest());
    const second = evaluateCanaryForecastEligibilityPolicy(policyRequest());

    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }

    // §9.3: age undecided is stricter than production_unapproved — must not mask.
    expect(first.decisionState).toBe("ineligible_age_unapproved");
    expect(first.decisionState).not.toBe("ineligible_production_unapproved");
    expect(first.decisionState).not.toBe("production_eligible");
    expect(first.technicalNumericEligible).toBe(true);
    expect(first.forecastEligibility).toBe("ineligible");
    expect(first.forecastExpectedDemandUnits).toBeNull();
    expect(first.forecastConfidence).toBe("low");
    expect(first.reasonCodes).toEqual(["FORECAST_UNAVAILABLE"]);
    expect(first.mappingNotes).toContain("FORECAST_FORCED_INELIGIBLE");
    expect(first.mappingNotes).toContain("TECHNICAL_NUMERIC_SIGNAL_OBSERVED");
    // Deterministic machine-readable blockers (not optional prose).
    expect(first.mappingNotes).toContain("AGE_POLICY_NOT_APPROVED");
    expect(first.mappingNotes).toContain("ALGORITHM_PIN_MISS");
    expect(first.mappingNotes).toContain("PRODUCTION_ATTESTATION_INACTIVE");
    expect(first.mappingNotes).toContain("HOSTED_SELECT_PACK_UNVERIFIED");
    expect(first.productionCreateBlockedUntil).toContain(
      "M6_PRODUCTION_FORECAST_ELIGIBILITY_APPROVED",
    );
    expect(first.warnings).toContain("NOT_m7_eligible");
    expect(first.warnings).toContain("m6_pe1b_canary_policy_only");
    expect(first.grain).toEqual({
      organizationId: ORG.toLowerCase(),
      storeId: STORE.toLowerCase(),
      locationId: LOCATION.toLowerCase(),
      variantId: VARIANT.toLowerCase(),
    });

    expect(second.ok).toBe(true);
    if (!second.ok) {
      return;
    }
    expect(second.decisionState).toBe(first.decisionState);
    expect(second.forecastEligibility).toBe(first.forecastEligibility);
    expect(second.forecastExpectedDemandUnits).toBe(
      first.forecastExpectedDemandUnits,
    );
    expect(second.forecastConfidence).toBe(first.forecastConfidence);
    expect(second.reasonCodes).toEqual(first.reasonCodes);
    expect(second.mappingNotes).toEqual(first.mappingNotes);
    expect(second.technicalNumericEligible).toBe(first.technicalNumericEligible);
    expect(second.grain).toEqual(first.grain);

    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.grain)).toBe(true);
    expect(Object.isFrozen(first.mappingNotes)).toBe(true);
    expect(Object.isFrozen(first.reasonCodes)).toBe(true);
  });

  it("fails closed on empty, revoked, mismatched, duplicate, and multi-active allowlists", () => {
    const binding = mintBinding();

    const empty = evaluateCanaryForecastEligibilityPolicy(
      policyRequest({ binding, canaryAllowlist: [] }),
    );
    expect(empty.ok).toBe(true);
    if (empty.ok) {
      expect(empty.decisionState).toBe("ineligible_allowlist");
      expect(empty.decisionState).not.toBe("ineligible_production_unapproved");
      expect(empty.forecastExpectedDemandUnits).toBeNull();
      expect(empty.mappingNotes).toContain("CANARY_ALLOWLIST_MISS");
      expect(empty.mappingNotes).toContain("AGE_POLICY_NOT_APPROVED");
      expect(empty.mappingNotes).toContain("ALGORITHM_PIN_MISS");
      expect(empty.technicalNumericEligible).toBe(true);
    }

    const revoked = evaluateCanaryForecastEligibilityPolicy(
      policyRequest({
        binding,
        canaryAllowlist: [
          allowlistEntry({ revokedAt: "2026-11-01T00:00:00.000Z" }),
        ],
      }),
    );
    expect(revoked.ok).toBe(true);
    if (revoked.ok) {
      expect(revoked.decisionState).toBe("ineligible_allowlist");
      expect(revoked.mappingNotes).toContain("CANARY_ALLOWLIST_REVOKED");
      expect(revoked.forecastEligibility).toBe("ineligible");
    }

    const mismatched = evaluateCanaryForecastEligibilityPolicy(
      policyRequest({
        binding,
        canaryAllowlist: [allowlistEntry({ organizationId: OTHER_ORG })],
      }),
    );
    expect(mismatched.ok).toBe(true);
    if (mismatched.ok) {
      expect(mismatched.decisionState).toBe("ineligible_allowlist");
      expect(mismatched.mappingNotes).toContain("CANARY_ALLOWLIST_MISS");
    }

    const duplicateSameGrain = evaluateCanaryForecastEligibilityPolicy(
      policyRequest({
        binding,
        canaryAllowlist: [allowlistEntry(), allowlistEntry()],
      }),
    );
    expect(duplicateSameGrain.ok).toBe(true);
    if (duplicateSameGrain.ok) {
      expect(duplicateSameGrain.decisionState).toBe("ineligible_allowlist");
      expect(duplicateSameGrain.mappingNotes).toContain("CANARY_ALLOWLIST_MISS");
      expect(duplicateSameGrain.forecastExpectedDemandUnits).toBeNull();
    }

    const multiActive = evaluateCanaryForecastEligibilityPolicy(
      policyRequest({
        binding,
        canaryAllowlist: [
          allowlistEntry(),
          allowlistEntry({
            variantId: "8100e000-0000-4000-8000-000000000099",
          }),
        ],
      }),
    );
    expect(multiActive.ok).toBe(true);
    if (multiActive.ok) {
      expect(multiActive.decisionState).toBe("ineligible_allowlist");
      expect(multiActive.mappingNotes).toContain("CANARY_ALLOWLIST_MISS");
    }
  });

  it("rejects cross-tenant grain mismatch between trustedGrain and PE1.a binding", () => {
    const binding = mintBinding();
    const result = evaluateCanaryForecastEligibilityPolicy(
      policyRequest({
        binding,
        trustedGrain: grain({ organizationId: OTHER_ORG }),
      }),
    );
    expect(result).toMatchObject({
      ok: false,
      code: "GRAIN_MISMATCH",
    });
    if (!result.ok) {
      expect(result.provenance.m7Eligible).toBe(false);
      expect(result.provenance.forecastEligibility).toBe("ineligible");
      expect(result.provenance.productionAttestationActive).toBe(false);
    }
  });

  it("rejects forged db_rpc authenticity claims and never upgrades structural binds", () => {
    const binding = mintBinding();
    expect(binding.provenance.evidenceAuthenticity).toBe(
      "fresh_reader_shaped_structural_only",
    );

    const forgedDb = evaluateCanaryForecastEligibilityPolicy(
      policyRequest({
        binding,
        evidenceAuthenticity: "db_rpc_fresh_reader_v1",
      }),
    );
    expect(forgedDb).toMatchObject({
      ok: false,
      code: "AUTHENTICITY_CLASS_INSUFFICIENT",
    });
    if (!forgedDb.ok) {
      expect(forgedDb.provenance.evidenceAuthenticity).toBe(
        "fresh_reader_shaped_structural_only",
      );
      expect(forgedDb.provenance.m7Eligible).toBe(false);
    }
  });

  it("rejects PE1.a forged, cloned, and WeakSet-unminted bindings", () => {
    const minted = mintBinding();

    const forgedPlain = {
      ...minted,
    } as Pe1aPublishedForecastBindingSuccess;
    expect(isPe1aTrustedPublishedForecastBindingSuccess(forgedPlain)).toBe(
      false,
    );
    expect(
      evaluateCanaryForecastEligibilityPolicy(
        policyRequest({ binding: forgedPlain }),
      ),
    ).toMatchObject({
      ok: false,
      code: "EVIDENCE_UNTRUSTED",
    });

    const assigned = Object.assign(
      {},
      minted,
    ) as Pe1aPublishedForecastBindingSuccess;
    expect(
      evaluateCanaryForecastEligibilityPolicy(
        policyRequest({ binding: assigned }),
      ),
    ).toMatchObject({
      ok: false,
      code: "EVIDENCE_UNTRUSTED",
    });

    const jsonClone = JSON.parse(
      JSON.stringify(minted),
    ) as Pe1aPublishedForecastBindingSuccess;
    expect(
      evaluateCanaryForecastEligibilityPolicy(
        policyRequest({ binding: jsonClone }),
      ),
    ).toMatchObject({
      ok: false,
      code: "EVIDENCE_UNTRUSTED",
    });

    const structured = structuredClone(
      minted,
    ) as Pe1aPublishedForecastBindingSuccess;
    expect(
      evaluateCanaryForecastEligibilityPolicy(
        policyRequest({ binding: structured }),
      ),
    ).toMatchObject({
      ok: false,
      code: "EVIDENCE_UNTRUSTED",
    });
  });

  it("rejects unapproved age/algorithm overrides and production trust claims", () => {
    const binding = mintBinding();

    expect(
      evaluateCanaryForecastEligibilityPolicy(
        {
          ...policyRequest({ binding }),
          forecastAgePolicy: "max_age_days_7" as "unapproved",
        },
      ),
    ).toMatchObject({
      ok: false,
      code: "AGE_POLICY_REJECTED",
    });

    expect(
      evaluateCanaryForecastEligibilityPolicy(
        {
          ...policyRequest({ binding }),
          algorithmPinPolicy: {
            algorithmVersion: "forecast-orchestrator-v1",
          } as unknown as "unapproved",
        },
      ),
    ).toMatchObject({
      ok: false,
      code: "ALGORITHM_PIN_POLICY_REJECTED",
    });

    expect(
      evaluateCanaryForecastEligibilityPolicy(
        policyRequest({
          binding,
          claimsProductionForecastApproval: true as false,
        }),
      ),
    ).toMatchObject({
      ok: false,
      code: "PRODUCTION_TRUST_CLAIM_REJECTED",
    });

    expect(
      evaluateCanaryForecastEligibilityPolicy(
        {
          ...policyRequest({ binding }),
          productionEligibilityAttestation: "forged-ok",
        } as unknown as Pe1bCanaryPolicyEvaluateRequest,
      ),
    ).toMatchObject({
      ok: false,
      code: "PRODUCTION_TRUST_CLAIM_REJECTED",
    });

    expect(
      evaluateCanaryForecastEligibilityPolicy(
        {
          ...policyRequest({ binding }),
          m7Eligible: true,
        } as unknown as Pe1bCanaryPolicyEvaluateRequest,
      ),
    ).toMatchObject({
      ok: false,
      code: "PRODUCTION_TRUST_CLAIM_REJECTED",
    });

    expect(
      evaluateCanaryForecastEligibilityPolicy(
        policyRequest({
          binding,
          policyAttestation: "forged" as typeof M6_PE1B_CANARY_POLICY_ATTESTATION_V1,
        }),
      ),
    ).toMatchObject({
      ok: false,
      code: "POLICY_ATTESTATION_INVALID",
    });
  });

  it("maps stale/pending/absent/confidence/unavailable evidence to §6 states", () => {
    const cases: Array<{
      disposition: string;
      state:
        | "ineligible_absent"
        | "ineligible_stale"
        | "ineligible_pending_correction"
        | "ineligible_confidence"
        | "ineligible_unavailable";
      reason: "FORECAST_UNAVAILABLE" | "FORECAST_CONFIDENCE_LOW";
    }> = [
      {
        disposition: "ABSENT",
        state: "ineligible_absent",
        reason: "FORECAST_UNAVAILABLE",
      },
      {
        disposition: "STALE",
        state: "ineligible_stale",
        reason: "FORECAST_UNAVAILABLE",
      },
      {
        disposition: "PENDING_CORRECTION",
        state: "ineligible_pending_correction",
        reason: "FORECAST_UNAVAILABLE",
      },
      {
        disposition: "FORECAST_CONFIDENCE_LOW",
        state: "ineligible_confidence",
        reason: "FORECAST_CONFIDENCE_LOW",
      },
      {
        disposition: "FORECAST_UNAVAILABLE",
        state: "ineligible_unavailable",
        reason: "FORECAST_UNAVAILABLE",
      },
    ];

    for (const row of cases) {
      const binding = mintBinding(missEvidence(row.disposition));
      const result = evaluateCanaryForecastEligibilityPolicy(
        policyRequest({ binding }),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) {
        continue;
      }
      expect(result.decisionState).toBe(row.state);
      expect(result.technicalNumericEligible).toBe(false);
      expect(result.forecastEligibility).toBe("ineligible");
      expect(result.forecastExpectedDemandUnits).toBeNull();
      expect(result.forecastConfidence).toBe("low");
      expect(result.reasonCodes).toEqual([row.reason]);
      expect(result.decisionState).not.toBe("ineligible_production_unapproved");
      expect(result.mappingNotes).toContain("AGE_POLICY_NOT_APPROVED");
      expect(result.mappingNotes).toContain("ALGORITHM_PIN_MISS");
      expect(result.mappingNotes).toContain("PRODUCTION_ATTESTATION_INACTIVE");
      expect(result.productionCreateBlockedUntil).toContain(
        "M6_PRODUCTION_FORECAST_ELIGIBILITY_APPROVED",
      );
    }
  });

  it("isolates outputs from later input mutation", () => {
    const binding = mintBinding();
    const trustedGrain = grain();
    const allowlist = [allowlistEntry()];
    const result = evaluateCanaryForecastEligibilityPolicy(
      policyRequest({ binding, trustedGrain, canaryAllowlist: allowlist }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    trustedGrain.organizationId = OTHER_ORG;
    allowlist[0]!.organizationId = OTHER_ORG;
    allowlist[0]!.revokedAt = "2026-11-04T00:00:00.000Z";

    expect(result.grain.organizationId).toBe(ORG.toLowerCase());
    expect(result.decisionState).toBe("ineligible_age_unapproved");
    expect(result.forecastExpectedDemandUnits).toBeNull();
    expect(result.technicalNumericEligible).toBe(true);
    expect(result.mappingNotes).toContain("AGE_POLICY_NOT_APPROVED");
    expect(result.mappingNotes).toContain("ALGORITHM_PIN_MISS");

    expect(() => {
      (result.grain as { storeId: string }).storeId =
        "8100e000-0000-4000-8000-000000009998";
    }).toThrow();
    expect(() => {
      (result as { forecastEligibility: string }).forecastEligibility =
        "eligible";
    }).toThrow();
    expect(() => {
      (result as { decisionState: string }).decisionState =
        "production_eligible";
    }).toThrow();

    expect(result.grain.storeId).toBe(STORE.toLowerCase());
    expect(result.forecastEligibility).toBe("ineligible");
    expect(result.decisionState).toBe("ineligible_age_unapproved");
  });
});
