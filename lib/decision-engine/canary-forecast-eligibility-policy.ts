/**
 * M6-PE1.b.1 — fail-closed canary forecast eligibility policy evaluator.
 *
 * Pure / offline policy overlay only. Accepts a PE1.a WeakSet-minted binding
 * plus an explicit canary allowlist and hard-false trust envelope. Always
 * forces production forecast ineligibility. Structural authenticity is
 * observation-only and never upgrades to authenticated DB provenance from
 * caller-supplied labels.
 *
 * Authority: docs/M6_PE1_B_CANARY_FORECAST_ELIGIBILITY_POLICY.md §§9, 14, 16–17.
 *
 * Does not:
 * - publish / persist / read Supabase / invoke fresh-reader RPCs
 * - approve algorithms, invent age/coverage thresholds, or mint canary UUIDs
 * - set m7Eligible, forecastEligibility, or production attestation true
 * - emit production_eligible or clear M6_PRODUCTION_FORECAST_ELIGIBILITY_APPROVED
 * - wire PB1, M7.2/M7.3, workers, cron, or HTTP routes
 */

import type { ForecastGrain } from "@/lib/forecasting/series";

import type { InventoryDecisionReasonCode } from "./types";

import {
  isPe1aTrustedPublishedForecastBindingSuccess,
  M6_PE1A_CHECK_TIME_FRESHNESS_LIMITATION_V1,
  type Pe1aBindingFailureCode,
  type Pe1aMappingNoteCode,
  type Pe1aProductionCreateGate,
  type Pe1aPublishedForecastBindingSuccess,
  type Pe1aPublishedForecastDisposition,
} from "./published-forecast-eligibility";

export const M6_PE1B_CANARY_ELIGIBILITY_POLICY_VERSION_V1 =
  "m6-pe1b-canary-eligibility-policy-v1" as const;

export const M6_PE1B_CANARY_POLICY_ATTESTATION_V1 =
  "m6-pe1b-canary-policy-attestation-v1" as const;

/**
 * Authenticity classes accepted on the request surface.
 * `db_rpc_fresh_reader_v1` may be declared only after a future authenticated
 * DB path exists; PE1.b.1 never upgrades structural PE1.a binds to that class.
 */
export type Pe1bEvidenceAuthenticity =
  | "fresh_reader_shaped_structural_only"
  | "db_rpc_fresh_reader_v1";

export type Pe1bCanaryAllowlistEntryV1 = {
  organizationId: string;
  storeId: string;
  locationId: string;
  variantId: string;
  label?: string;
  approvedBy?: string;
  approvedAt?: string;
  revokedAt?: string | null;
};

export type Pe1bDecisionState =
  | "rejected_grain"
  | "rejected_conflict"
  | "rejected_freshness_claim"
  | "rejected_trust_claim"
  | "rejected_identity"
  | "ineligible_absent"
  | "ineligible_stale"
  | "ineligible_pending_correction"
  | "ineligible_confidence"
  | "ineligible_unavailable"
  | "ineligible_allowlist"
  | "ineligible_age_unapproved"
  | "ineligible_algorithm_unapproved"
  | "ineligible_production_unapproved"
  | "technical_numeric_observed"
  | "production_eligible";

export type Pe1bPolicyFailureCode =
  | "CANARY_ALLOWLIST_MISS"
  | "CANARY_ALLOWLIST_REVOKED"
  | "ALGORITHM_PIN_MISS"
  | "AUTHENTICITY_CLASS_INSUFFICIENT"
  | "HOSTED_SELECT_PACK_UNVERIFIED"
  | "KILL_SWITCH_ACTIVE"
  | "PRODUCTION_ATTESTATION_INACTIVE"
  | "POLICY_ATTESTATION_INVALID"
  | "AGE_POLICY_REJECTED"
  | "ALGORITHM_PIN_POLICY_REJECTED";

export type Pe1bMappingNoteCode =
  | Pe1aMappingNoteCode
  | "CANARY_ALLOWLIST_MISS"
  | "CANARY_ALLOWLIST_REVOKED"
  | "ALGORITHM_PIN_MISS"
  | "AUTHENTICITY_CLASS_INSUFFICIENT"
  | "HOSTED_SELECT_PACK_UNVERIFIED"
  | "KILL_SWITCH_ACTIVE"
  | "PRODUCTION_ATTESTATION_INACTIVE";

export interface Pe1bHardFalseProvenance {
  audience: "local_developer" | "internal_preparation";
  evidenceScope: "m6_pe1b_canary_policy_only";
  /**
   * Effective authenticity after fail-closed evaluation.
   * Caller labels never upgrade past what PE1.a can prove.
   */
  evidenceAuthenticity: "fresh_reader_shaped_structural_only";
  forecastEligibility: "ineligible";
  isScoredMerchantDecision: false;
  claimsMerchantFacing: false;
  claimsProductionForecastApproval: false;
  claimsM7ProductionEligibility: false;
  algorithmApproved: false;
  productionDecisionCreationEligible: false;
  productionApprovalEligible: false;
  notProductionActivation: true;
  engineBoundBriefEligible: false;
  m7Eligible: false;
  productionAttestationActive: false;
}

export interface Pe1bCanaryPolicyEvaluateRequest {
  policyVersion: typeof M6_PE1B_CANARY_ELIGIBILITY_POLICY_VERSION_V1;
  policyAttestation: typeof M6_PE1B_CANARY_POLICY_ATTESTATION_V1;
  trustedGrain: ForecastGrain;
  binding: Pe1aPublishedForecastBindingSuccess;
  evidenceAuthenticity: Pe1bEvidenceAuthenticity;
  canaryAllowlist: Pe1bCanaryAllowlistEntryV1[];
  claimsMerchantFacing: false;
  claimsProductionForecastApproval: false;
  claimsM7ProductionEligibility: false;
  algorithmApproved: false;
  forecastAgePolicy: "unapproved";
  algorithmPinPolicy: "unapproved";
  productionEligibilityAttestation: null;
}

export interface Pe1bCanaryPolicyEvaluateRejection {
  ok: false;
  policyVersion: typeof M6_PE1B_CANARY_ELIGIBILITY_POLICY_VERSION_V1;
  code: Pe1aBindingFailureCode | Pe1bPolicyFailureCode;
  detail: string;
  provenance: Pe1bHardFalseProvenance;
}

export interface Pe1bCanaryPolicyEvaluateSuccess {
  ok: true;
  policyVersion: typeof M6_PE1B_CANARY_ELIGIBILITY_POLICY_VERSION_V1;
  grain: ForecastGrain;
  decisionState: Exclude<Pe1bDecisionState, "production_eligible">;
  technicalNumericEligible: boolean;
  forecastEligibility: "ineligible";
  forecastExpectedDemandUnits: null;
  forecastConfidence: "low";
  reasonCodes: readonly InventoryDecisionReasonCode[];
  mappingNotes: readonly Pe1bMappingNoteCode[];
  productionCreateBlockedUntil: readonly Pe1aProductionCreateGate[];
  warnings: readonly [
    "m6_pe1b_canary_policy_only",
    "NOT_production_forecast",
    "NOT_m7_eligible",
    "NOT_merchant_facing",
    "NOT_production_activation",
    "NOT_production_decision_create",
    "NOT_m7_3_approvable",
    "NOT_engine_bound_brief",
  ];
}

export type Pe1bCanaryPolicyEvaluateResult =
  | Pe1bCanaryPolicyEvaluateRejection
  | Pe1bCanaryPolicyEvaluateSuccess;

const WARNINGS = Object.freeze([
  "m6_pe1b_canary_policy_only",
  "NOT_production_forecast",
  "NOT_m7_eligible",
  "NOT_merchant_facing",
  "NOT_production_activation",
  "NOT_production_decision_create",
  "NOT_m7_3_approvable",
  "NOT_engine_bound_brief",
] as const);

const PRODUCTION_CREATE_GATES = Object.freeze([
  "M6_PRODUCTION_FORECAST_ELIGIBILITY_APPROVED",
  "TRUSTED_INCOMING_EVIDENCE_AVAILABLE",
  "TRUSTED_M5_SOURCE_OF_CREATE_WRITER_APPROVED",
  "M7_3_MERCHANT_APPROVABLE_PREDICATE_APPROVED",
] as const satisfies readonly Pe1aProductionCreateGate[]);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Keys that must never appear on the request envelope as bypass channels.
 * Hard-false trust fields are required properties and validated separately.
 */
const FORBIDDEN_REQUEST_BYPASS_KEYS = new Set([
  "forecastExpectedDemandUnits",
  "forecastEligibility",
  "forecastConfidence",
  "m7Eligible",
  "m7NumericEligible",
  "productionDecisionCreationEligible",
  "productionApprovalEligible",
  "trustedCompleteDates",
  "fabricatedDemand",
  "decisionInput",
  "dailyDemand",
  "disposition",
  "decisionState",
  "production_eligible",
  "maxAgeHours",
  "maxAgeDays",
  "approvedAlgorithmVersion",
]);

/**
 * Evaluate canary forecast eligibility policy. Always production-ineligible.
 * Pure / deterministic / fail-closed. No side effects.
 */
export function evaluateCanaryForecastEligibilityPolicy(
  request: Pe1bCanaryPolicyEvaluateRequest,
): Pe1bCanaryPolicyEvaluateResult {
  const envelope = validateRequestEnvelope(request);
  if (envelope) {
    return envelope;
  }

  const grain = cloneGrain(request.trustedGrain);
  if (!grain.ok) {
    return grain.rejection;
  }

  if (!isPe1aTrustedPublishedForecastBindingSuccess(request.binding)) {
    return reject(
      "EVIDENCE_UNTRUSTED",
      "PE1.b requires a WeakSet-minted PE1.a published-forecast binding success; clones and forgeries are rejected.",
    );
  }

  const binding = request.binding;

  if (!grainsEqual(binding.grain, grain.value)) {
    return reject(
      "GRAIN_MISMATCH",
      "trustedGrain does not match PE1.a binding grain.",
    );
  }

  // Defensive re-check of PE1.a hard-false decision fields / freshness limits.
  if (
    binding.forecastEligibility !== "ineligible" ||
    binding.forecastExpectedDemandUnits !== null ||
    binding.forecastConfidence !== "low" ||
    binding.provenance.m7Eligible !== false ||
    binding.provenance.forecastEligibility !== "ineligible" ||
    binding.observed.claimsPostCommitFreshness !== false ||
    binding.observed.freshnessLimitation !==
      M6_PE1A_CHECK_TIME_FRESHNESS_LIMITATION_V1
  ) {
    return reject(
      "FRESHNESS_CLAIM_REJECTED",
      "PE1.a binding no longer satisfies PE1.b hard-false / check-time freshness contract.",
    );
  }

  if (
    binding.provenance.claimsProductionForecastApproval !== false ||
    binding.provenance.claimsM7ProductionEligibility !== false ||
    binding.provenance.algorithmApproved !== false ||
    binding.provenance.productionDecisionCreationEligible !== false ||
    binding.provenance.productionApprovalEligible !== false
  ) {
    return reject(
      "PRODUCTION_TRUST_CLAIM_REJECTED",
      "PE1.a binding provenance must remain hard-false under PE1.b.",
    );
  }

  const authenticity = resolveAuthenticity(request, binding);
  if (!authenticity.ok) {
    return authenticity.rejection;
  }

  const allowlist = evaluateAllowlist(request.canaryAllowlist, grain.value);
  if (!allowlist.ok) {
    return allowlist.rejection;
  }

  if (!allowlist.matched) {
    return succeed({
      grain: grain.value,
      decisionState: "ineligible_allowlist",
      technicalNumericEligible: binding.observed.technicalNumericEligible,
      reasonCodes: freezeReasonCodes(binding.reasonCodes),
      mappingNotes: buildMappingNotes({
        binding,
        authenticityNote: authenticity.note,
        allowlistNote: allowlist.note,
        ageUnapproved: true,
        algorithmUnapproved: true,
        productionAttestationInactive: true,
      }),
    });
  }

  const mappingNotes = buildMappingNotes({
    binding,
    authenticityNote: authenticity.note,
    allowlistNote: null,
    ageUnapproved: true,
    algorithmUnapproved: true,
    productionAttestationInactive: true,
  });

  // Technically eligible + allowlisted under PE1.b.1:
  // Age-D, algorithm pin, and production attestation are all inactive.
  // §9.3 precedence (strictest first): age → algorithm → production.
  // Never emit ineligible_production_unapproved while age/algorithm blockers
  // still apply — that would mask stricter rejection conditions.
  // AGE_POLICY_NOT_APPROVED and ALGORITHM_PIN_MISS remain mandatory
  // machine-readable mappingNotes on every success path.
  // Never emit production_eligible.
  if (binding.observed.disposition === "eligible") {
    return succeed({
      grain: grain.value,
      decisionState: selectTechnicalIneligibleState({
        ageUnapproved: true,
        algorithmUnapproved: true,
        productionAttestationInactive: true,
      }),
      technicalNumericEligible: true,
      reasonCodes: freezeReasonCodes(binding.reasonCodes),
      mappingNotes,
    });
  }

  return succeed({
    grain: grain.value,
    decisionState: mapDispositionDecisionState(binding.observed.disposition),
    technicalNumericEligible: false,
    reasonCodes: freezeReasonCodes(binding.reasonCodes),
    mappingNotes,
  });
}

/**
 * §9.3 technical-eligible precedence. Stricter gates win; production_unapproved
 * is only reachable when age and algorithm pins are both approved.
 */
function selectTechnicalIneligibleState(args: {
  ageUnapproved: boolean;
  algorithmUnapproved: boolean;
  productionAttestationInactive: boolean;
}): Exclude<Pe1bDecisionState, "production_eligible"> {
  if (args.ageUnapproved) {
    return "ineligible_age_unapproved";
  }
  if (args.algorithmUnapproved) {
    return "ineligible_algorithm_unapproved";
  }
  if (args.productionAttestationInactive) {
    return "ineligible_production_unapproved";
  }
  // No approved production path under PE1.b.1 — fail closed.
  return "ineligible_production_unapproved";
}

function validateRequestEnvelope(
  request: Pe1bCanaryPolicyEvaluateRequest,
): Pe1bCanaryPolicyEvaluateRejection | null {
  if (request === null || typeof request !== "object") {
    return reject(
      "POLICY_ATTESTATION_INVALID",
      "PE1.b policy evaluation request is required.",
    );
  }

  if (Array.isArray(request)) {
    return reject(
      "CROSS_GRAIN_AGGREGATION_FORBIDDEN",
      "PE1.b forbids array / multi-grain request envelopes.",
    );
  }

  if (
    request.policyVersion !== M6_PE1B_CANARY_ELIGIBILITY_POLICY_VERSION_V1 ||
    request.policyAttestation !== M6_PE1B_CANARY_POLICY_ATTESTATION_V1
  ) {
    return reject(
      "POLICY_ATTESTATION_INVALID",
      "policyVersion/policyAttestation must be m6-pe1b canary eligibility policy v1.",
    );
  }

  if (
    request.claimsMerchantFacing !== false ||
    request.claimsProductionForecastApproval !== false ||
    request.claimsM7ProductionEligibility !== false ||
    request.algorithmApproved !== false
  ) {
    return reject(
      "PRODUCTION_TRUST_CLAIM_REJECTED",
      "PE1.b rejects merchant/production/algorithm approval claims.",
    );
  }

  if (request.forecastAgePolicy !== "unapproved") {
    return reject(
      "AGE_POLICY_REJECTED",
      'PE1.b Age-D requires forecastAgePolicy "unapproved"; numeric age SLAs are not approved.',
    );
  }

  if (request.algorithmPinPolicy !== "unapproved") {
    return reject(
      "ALGORITHM_PIN_POLICY_REJECTED",
      'PE1.b requires algorithmPinPolicy "unapproved"; no algorithm pin is approved.',
    );
  }

  if (request.productionEligibilityAttestation !== null) {
    return reject(
      "PRODUCTION_TRUST_CLAIM_REJECTED",
      "PE1.b requires productionEligibilityAttestation null; production attestation is inactive.",
    );
  }

  const asRecord = request as unknown as Record<string, unknown>;
  for (const key of FORBIDDEN_REQUEST_BYPASS_KEYS) {
    if (Object.prototype.hasOwnProperty.call(asRecord, key)) {
      return reject(
        "PRODUCTION_TRUST_CLAIM_REJECTED",
        `PE1.b rejects caller-supplied "${key}" on the policy request.`,
      );
    }
  }

  if (!Array.isArray(request.canaryAllowlist)) {
    return reject(
      "EVIDENCE_MALFORMED",
      "canaryAllowlist must be an array (empty ⇒ allowlist miss).",
    );
  }

  if (
    request.evidenceAuthenticity !== "fresh_reader_shaped_structural_only" &&
    request.evidenceAuthenticity !== "db_rpc_fresh_reader_v1"
  ) {
    return reject(
      "AUTHENTICITY_CLASS_INSUFFICIENT",
      "evidenceAuthenticity must be a known PE1.b authenticity class.",
    );
  }

  return null;
}

function resolveAuthenticity(
  request: Pe1bCanaryPolicyEvaluateRequest,
  binding: Pe1aPublishedForecastBindingSuccess,
):
  | { ok: true; note: Pe1bMappingNoteCode | null }
  | { ok: false; rejection: Pe1bCanaryPolicyEvaluateRejection } {
  // PE1.a minted binds are always structural_only. Never upgrade from a
  // caller-supplied db_rpc label.
  if (
    binding.provenance.evidenceAuthenticity !==
    "fresh_reader_shaped_structural_only"
  ) {
    return {
      ok: false,
      rejection: reject(
        "AUTHENTICITY_CLASS_INSUFFICIENT",
        "PE1.a binding authenticity is not structural-only; PE1.b.1 cannot trust upgraded classes.",
      ),
    };
  }

  if (request.evidenceAuthenticity === "db_rpc_fresh_reader_v1") {
    return {
      ok: false,
      rejection: reject(
        "AUTHENTICITY_CLASS_INSUFFICIENT",
        "PE1.b.1 rejects caller-forged db_rpc_fresh_reader_v1 claims; structural PE1.a binds do not authenticate DB/RPC provenance.",
      ),
    };
  }

  if (request.evidenceAuthenticity !== "fresh_reader_shaped_structural_only") {
    return {
      ok: false,
      rejection: reject(
        "AUTHENTICITY_CLASS_INSUFFICIENT",
        "unknown or insufficient evidenceAuthenticity for PE1.b.1.",
      ),
    };
  }

  // Structural authenticity is accepted only for ineligible observation.
  // Do not emit AUTHENTICITY_CLASS_INSUFFICIENT on the accepted structural path;
  // that code is reserved for rejected/forged authenticity claims.
  return { ok: true, note: null };
}

function evaluateAllowlist(
  allowlist: Pe1bCanaryAllowlistEntryV1[],
  trustedGrain: ForecastGrain,
):
  | {
      ok: true;
      matched: boolean;
      note: "CANARY_ALLOWLIST_MISS" | "CANARY_ALLOWLIST_REVOKED";
    }
  | { ok: false; rejection: Pe1bCanaryPolicyEvaluateRejection } {
  // Fail closed unless exactly one active (non-revoked) entry exists.
  const active: Pe1bCanaryAllowlistEntryV1[] = [];
  let revokedMatch = false;

  for (const entry of allowlist) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      return {
        ok: false,
        rejection: reject(
          "EVIDENCE_MALFORMED",
          "canaryAllowlist entries must be non-null objects.",
        ),
      };
    }

    let entryGrain: ForecastGrain;
    try {
      entryGrain = {
        organizationId: assertUuid(
          entry.organizationId,
          "canaryAllowlist.organizationId",
        ),
        storeId: assertUuid(entry.storeId, "canaryAllowlist.storeId"),
        locationId: assertUuid(entry.locationId, "canaryAllowlist.locationId"),
        variantId: assertUuid(entry.variantId, "canaryAllowlist.variantId"),
      };
    } catch (error) {
      return {
        ok: false,
        rejection: reject(
          "IDENTITY_INVALID",
          error instanceof Error
            ? error.message
            : "canaryAllowlist identity invalid.",
        ),
      };
    }

    const revoked =
      entry.revokedAt !== null &&
      entry.revokedAt !== undefined &&
      entry.revokedAt !== "";

    if (grainsEqual(entryGrain, trustedGrain) && revoked) {
      revokedMatch = true;
    }

    if (!revoked) {
      active.push(entry);
    }
  }

  if (active.length === 0) {
    return {
      ok: true,
      matched: false,
      note: revokedMatch ? "CANARY_ALLOWLIST_REVOKED" : "CANARY_ALLOWLIST_MISS",
    };
  }

  // First canary: exactly one active entry permitted.
  if (active.length !== 1) {
    return {
      ok: true,
      matched: false,
      note: "CANARY_ALLOWLIST_MISS",
    };
  }

  const sole = active[0]!;
  const soleGrain: ForecastGrain = {
    organizationId: sole.organizationId.toLowerCase(),
    storeId: sole.storeId.toLowerCase(),
    locationId: sole.locationId.toLowerCase(),
    variantId: sole.variantId.toLowerCase(),
  };

  if (!grainsEqual(soleGrain, trustedGrain)) {
    return {
      ok: true,
      matched: false,
      note: "CANARY_ALLOWLIST_MISS",
    };
  }

  return {
    ok: true,
    matched: true,
    note: "CANARY_ALLOWLIST_MISS",
  };
}

function mapDispositionDecisionState(
  disposition: Pe1aPublishedForecastDisposition,
): Exclude<
  Pe1bDecisionState,
  | "production_eligible"
  | "ineligible_age_unapproved"
  | "ineligible_algorithm_unapproved"
  | "ineligible_production_unapproved"
  | "ineligible_allowlist"
  | "technical_numeric_observed"
  | "rejected_grain"
  | "rejected_conflict"
  | "rejected_freshness_claim"
  | "rejected_trust_claim"
  | "rejected_identity"
> {
  switch (disposition) {
    case "ABSENT":
      return "ineligible_absent";
    case "STALE":
      return "ineligible_stale";
    case "PENDING_CORRECTION":
      return "ineligible_pending_correction";
    case "FORECAST_CONFIDENCE_LOW":
      return "ineligible_confidence";
    case "FORECAST_UNAVAILABLE":
    default:
      return "ineligible_unavailable";
  }
}

function buildMappingNotes(args: {
  binding: Pe1aPublishedForecastBindingSuccess;
  authenticityNote: Pe1bMappingNoteCode | null;
  allowlistNote: Pe1bMappingNoteCode | null;
  ageUnapproved: boolean;
  algorithmUnapproved: boolean;
  productionAttestationInactive: boolean;
}): Pe1bMappingNoteCode[] {
  const notes: Pe1bMappingNoteCode[] = [
    "FORECAST_FORCED_INELIGIBLE",
    "CHECK_TIME_FRESHNESS_ONLY",
    "OBSERVED_DEMAND_NOT_DECISION_INPUT",
    "HOSTED_SELECT_PACK_UNVERIFIED",
  ];

  if (args.ageUnapproved) {
    notes.push("AGE_POLICY_NOT_APPROVED");
  }
  if (args.algorithmUnapproved) {
    notes.push("ALGORITHM_PIN_MISS");
  }
  if (args.productionAttestationInactive) {
    notes.push("PRODUCTION_ATTESTATION_INACTIVE");
  }
  if (args.authenticityNote) {
    notes.push(args.authenticityNote);
  }
  if (args.allowlistNote) {
    notes.push(args.allowlistNote);
  }

  // Preserve PE1.a technical / disposition notes without inventing demand.
  for (const note of args.binding.mappingNotes) {
    if (!notes.includes(note)) {
      notes.push(note);
    }
  }

  return notes;
}

function succeed(args: {
  grain: ForecastGrain;
  decisionState: Exclude<Pe1bDecisionState, "production_eligible">;
  technicalNumericEligible: boolean;
  reasonCodes: readonly InventoryDecisionReasonCode[];
  mappingNotes: Pe1bMappingNoteCode[];
}): Pe1bCanaryPolicyEvaluateSuccess {
  // Architecture invariant: production_eligible must never be constructed.
  if ((args.decisionState as string) === "production_eligible") {
    return Object.freeze({
      ok: true as const,
      policyVersion: M6_PE1B_CANARY_ELIGIBILITY_POLICY_VERSION_V1,
      grain: Object.freeze({ ...args.grain }),
      decisionState: "ineligible_production_unapproved" as const,
      technicalNumericEligible: false,
      forecastEligibility: "ineligible" as const,
      forecastExpectedDemandUnits: null,
      forecastConfidence: "low" as const,
      reasonCodes: Object.freeze(["FORECAST_UNAVAILABLE"] as const),
      mappingNotes: Object.freeze([
        "FORECAST_FORCED_INELIGIBLE",
        "PRODUCTION_ATTESTATION_INACTIVE",
        "AGE_POLICY_NOT_APPROVED",
        "ALGORITHM_PIN_MISS",
      ] as Pe1bMappingNoteCode[]),
      productionCreateBlockedUntil: PRODUCTION_CREATE_GATES,
      warnings: WARNINGS,
    });
  }

  return Object.freeze({
    ok: true as const,
    policyVersion: M6_PE1B_CANARY_ELIGIBILITY_POLICY_VERSION_V1,
    grain: Object.freeze({ ...args.grain }),
    decisionState: args.decisionState,
    technicalNumericEligible: args.technicalNumericEligible,
    forecastEligibility: "ineligible" as const,
    forecastExpectedDemandUnits: null,
    forecastConfidence: "low" as const,
    reasonCodes: Object.freeze([...args.reasonCodes]),
    mappingNotes: Object.freeze([...args.mappingNotes]),
    productionCreateBlockedUntil: PRODUCTION_CREATE_GATES,
    warnings: WARNINGS,
  });
}

function hardFalseProvenance(): Pe1bHardFalseProvenance {
  return Object.freeze({
    audience: "internal_preparation" as const,
    evidenceScope: "m6_pe1b_canary_policy_only" as const,
    evidenceAuthenticity: "fresh_reader_shaped_structural_only" as const,
    forecastEligibility: "ineligible" as const,
    isScoredMerchantDecision: false as const,
    claimsMerchantFacing: false as const,
    claimsProductionForecastApproval: false as const,
    claimsM7ProductionEligibility: false as const,
    algorithmApproved: false as const,
    productionDecisionCreationEligible: false as const,
    productionApprovalEligible: false as const,
    notProductionActivation: true as const,
    engineBoundBriefEligible: false as const,
    m7Eligible: false as const,
    productionAttestationActive: false as const,
  });
}

function reject(
  code: Pe1aBindingFailureCode | Pe1bPolicyFailureCode,
  detail: string,
): Pe1bCanaryPolicyEvaluateRejection {
  return Object.freeze({
    ok: false as const,
    policyVersion: M6_PE1B_CANARY_ELIGIBILITY_POLICY_VERSION_V1,
    code,
    detail,
    provenance: hardFalseProvenance(),
  });
}

function cloneGrain(
  value: unknown,
):
  | { ok: true; value: ForecastGrain }
  | { ok: false; rejection: Pe1bCanaryPolicyEvaluateRejection } {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return {
      ok: false,
      rejection: reject("GRAIN_MISMATCH", "trustedGrain is required."),
    };
  }

  const row = value as Record<string, unknown>;
  try {
    return {
      ok: true,
      value: {
        organizationId: assertUuid(row.organizationId, "trustedGrain.organizationId"),
        storeId: assertUuid(row.storeId, "trustedGrain.storeId"),
        locationId: assertUuid(row.locationId, "trustedGrain.locationId"),
        variantId: assertUuid(row.variantId, "trustedGrain.variantId"),
      },
    };
  } catch (error) {
    return {
      ok: false,
      rejection: reject(
        "IDENTITY_INVALID",
        error instanceof Error ? error.message : "trustedGrain identity invalid.",
      ),
    };
  }
}

function grainsEqual(left: ForecastGrain, right: ForecastGrain): boolean {
  return (
    left.organizationId.toLowerCase() === right.organizationId.toLowerCase() &&
    left.storeId.toLowerCase() === right.storeId.toLowerCase() &&
    left.locationId.toLowerCase() === right.locationId.toLowerCase() &&
    left.variantId.toLowerCase() === right.variantId.toLowerCase()
  );
}

function assertUuid(value: unknown, field: string): string {
  if (typeof value !== "string" || !UUID_RE.test(value)) {
    throw new Error(`${field} must be a UUID.`);
  }
  return value.toLowerCase();
}

function freezeReasonCodes(
  codes: readonly InventoryDecisionReasonCode[],
): readonly InventoryDecisionReasonCode[] {
  return Object.freeze([...codes]);
}
