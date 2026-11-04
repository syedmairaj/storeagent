/**
 * M6-PE1.a — fail-closed published-forecast evidence binder.
 *
 * Pure / offline preparation only. Accepts **fresh-reader-shaped** payloads
 * and structurally revalidates them. A successful bind proves only that this
 * module minted the result after fail-closed structural checks — it does
 * **not** authenticate database issuance, RPC origin, or post-return freshness.
 * Operational callers should still obtain evidence from
 * `readFreshPublishedSkuForecast` before binding.
 *
 * Preserves observed identity and quality signals, and always forces
 * production forecast ineligibility for M7 decision fields. Binding
 * attestation authorizes this preparation path only; it never grants
 * production trust via caller-controlled fields.
 *
 * Authority: docs/M6_PE1_FORECAST_ELIGIBILITY_READINESS.md §G (PE1.a).
 *
 * Does not:
 * - publish / persist / read Supabase
 * - invoke the inventory decision engine or fixture evaluation adapters
 * - set m7Eligible, forecastEligibility, or productionDecisionCreationEligible
 *   to production-true
 * - invent demand, coverage, confidence, or age approval
 * - treat structural validation as authenticated DB evidence
 */

import type { ConfidenceLevel } from "@/lib/commerce-domain/types";

import type { ForecastGrain } from "@/lib/forecasting/series";

import type { InventoryDecisionReasonCode } from "./types";

/**
 * Opaque mint gate: only bindPublishedForecastEvidence may register successes.
 * Downstream consumers must refuse forged plain objects.
 */
const mintedTrustedPublishedForecastBindings = new WeakSet<object>();

export const M6_PE1A_PUBLISHED_FORECAST_BINDER_VERSION_V1 =
  "m6-pe1a-published-forecast-eligibility-v1" as const;

export const M6_PE1A_BINDING_ATTESTATION_V1 =
  "m6-pe1a-published-forecast-binding-v1" as const;

/**
 * Exact check-time freshness limitation from M6 P3d.3 reader contract.
 * Forged / rewritten limitation strings fail closed.
 */
export const M6_PE1A_CHECK_TIME_FRESHNESS_LIMITATION_V1 =
  "read_fresh_published_sku_forecast proves source_token identity and publication gates at check time only; it does not prove post-return freshness or acceptable forecast age. M7 owns forecast-age policy and must revalidate before acting." as const;

export type Pe1aPublishedForecastMissDisposition =
  | "ABSENT"
  | "STALE"
  | "PENDING_CORRECTION"
  | "FORECAST_UNAVAILABLE"
  | "FORECAST_CONFIDENCE_LOW";

export type Pe1aPublishedForecastDisposition =
  | "eligible"
  | Pe1aPublishedForecastMissDisposition;

export type Pe1aProductionCreateGate =
  | "M6_PRODUCTION_FORECAST_ELIGIBILITY_APPROVED"
  | "TRUSTED_INCOMING_EVIDENCE_AVAILABLE"
  | "TRUSTED_M5_SOURCE_OF_CREATE_WRITER_APPROVED"
  | "M7_3_MERCHANT_APPROVABLE_PREDICATE_APPROVED";

export type Pe1aBindingFailureCode =
  | "BINDING_ATTESTATION_INVALID"
  | "PRODUCTION_TRUST_CLAIM_REJECTED"
  | "GRAIN_MISMATCH"
  | "EVIDENCE_MALFORMED"
  | "EVIDENCE_UNTRUSTED"
  | "FRESHNESS_CLAIM_REJECTED"
  | "IDENTITY_INVALID"
  | "CONFLICTING_EVIDENCE"
  | "CROSS_GRAIN_AGGREGATION_FORBIDDEN";

export type Pe1aMappingNoteCode =
  | "FORECAST_FORCED_INELIGIBLE"
  | "TECHNICAL_NUMERIC_SIGNAL_OBSERVED"
  | "TECHNICAL_NUMERIC_SIGNAL_ABSENT"
  | "AGE_POLICY_NOT_APPROVED"
  | "CHECK_TIME_FRESHNESS_ONLY"
  | "OBSERVED_DEMAND_NOT_DECISION_INPUT"
  | "DISPOSITION_ABSENT"
  | "DISPOSITION_STALE"
  | "DISPOSITION_PENDING_CORRECTION"
  | "DISPOSITION_FORECAST_UNAVAILABLE"
  | "DISPOSITION_FORECAST_CONFIDENCE_LOW"
  | "DISPOSITION_TECHNICALLY_ELIGIBLE";

export interface Pe1aHardFalseProvenance {
  audience: "local_developer" | "internal_preparation";
  /**
   * Structural preparation only — not authenticated DB/RPC provenance.
   */
  evidenceScope: "m6_published_forecast_preparation_only";
  /**
   * Explicit class: caller-shaped fresh-reader payload, structurally checked.
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
  /**
   * Explicit: technical m7NumericEligible never becomes production m7Eligible.
   */
  m7Eligible: false;
}

export interface Pe1aPublishedForecastBindRequest {
  binderVersion: typeof M6_PE1A_PUBLISHED_FORECAST_BINDER_VERSION_V1;
  bindingAttestation: typeof M6_PE1A_BINDING_ATTESTATION_V1;
  trustedGrain: ForecastGrain;
  /**
   * Fresh-reader-shaped payload or unknown. Structurally revalidated only —
   * not proof of DB/RPC authenticity. Forged / malformed shapes fail closed.
   * Callers must not supply decision-field overrides here.
   */
  evidence: unknown;
  claimsMerchantFacing: false;
  claimsProductionForecastApproval: false;
  claimsM7ProductionEligibility: false;
  algorithmApproved: false;
}

export interface Pe1aObservedPublishedForecastEvidence {
  disposition: Pe1aPublishedForecastDisposition;
  /**
   * Technical numeric usability from fresh-reader semantics only.
   * Never production eligibility / never m7Eligible.
   */
  technicalNumericEligible: boolean;
  dailyDemandObserved: number | null;
  confidenceObserved: "high" | "medium" | "low" | "none" | null;
  modeObserved: "standard" | "limited_history" | "unavailable" | null;
  dataSufficiencyObserved: "sufficient" | "limited" | "insufficient" | null;
  publicationId: string | null;
  forecastRunId: string | null;
  skuForecastId: string | null;
  sourceToken: string | null;
  forecastAsOf: string | null;
  lookbackDays: number | null;
  claimsPostCommitFreshness: false;
  freshnessLimitation: typeof M6_PE1A_CHECK_TIME_FRESHNESS_LIMITATION_V1;
}

export interface Pe1aPublishedForecastBindingRejection {
  ok: false;
  binderVersion: typeof M6_PE1A_PUBLISHED_FORECAST_BINDER_VERSION_V1;
  code: Pe1aBindingFailureCode;
  detail: string;
  provenance: Pe1aHardFalseProvenance;
}

export interface Pe1aPublishedForecastBindingSuccess {
  ok: true;
  binderVersion: typeof M6_PE1A_PUBLISHED_FORECAST_BINDER_VERSION_V1;
  grain: ForecastGrain;
  observed: Pe1aObservedPublishedForecastEvidence;
  /**
   * Decision-facing forecast fields — always production-ineligible in PE1.a.
   */
  forecastEligibility: "ineligible";
  forecastExpectedDemandUnits: null;
  forecastConfidence: "low";
  reasonCodes: readonly InventoryDecisionReasonCode[];
  mappingNotes: readonly Pe1aMappingNoteCode[];
  provenance: Pe1aHardFalseProvenance;
  warnings: readonly [
    "m6_published_forecast_preparation_only",
    "NOT_merchant_facing",
    "NOT_production_activation",
    "NOT_production_forecast",
    "NOT_production_decision_create",
    "NOT_m7_3_approvable",
    "NOT_engine_bound_brief",
    "NOT_m7_eligible",
  ];
  productionCreateBlockedUntil: readonly Pe1aProductionCreateGate[];
}

export type Pe1aPublishedForecastBindingResult =
  | Pe1aPublishedForecastBindingRejection
  | Pe1aPublishedForecastBindingSuccess;

const WARNINGS = Object.freeze([
  "m6_published_forecast_preparation_only",
  "NOT_merchant_facing",
  "NOT_production_activation",
  "NOT_production_forecast",
  "NOT_production_decision_create",
  "NOT_m7_3_approvable",
  "NOT_engine_bound_brief",
  "NOT_m7_eligible",
] as const);

const PRODUCTION_CREATE_GATES = Object.freeze([
  "M6_PRODUCTION_FORECAST_ELIGIBILITY_APPROVED",
  "TRUSTED_INCOMING_EVIDENCE_AVAILABLE",
  "TRUSTED_M5_SOURCE_OF_CREATE_WRITER_APPROVED",
  "M7_3_MERCHANT_APPROVABLE_PREDICATE_APPROVED",
] as const satisfies readonly Pe1aProductionCreateGate[]);

const MISS_DISPOSITIONS = new Set<Pe1aPublishedForecastMissDisposition>([
  "ABSENT",
  "STALE",
  "PENDING_CORRECTION",
  "FORECAST_UNAVAILABLE",
  "FORECAST_CONFIDENCE_LOW",
]);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const SOURCE_TOKEN_RE = /^[a-f0-9]{32}$/i;

/**
 * Keys that must never appear on the request envelope as bypass channels.
 * Hard-false trust fields (`claims*`, `algorithmApproved`) are required
 * request properties and are validated separately for exact `false`.
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
]);

/**
 * Keys that must never appear on evidence payloads (forgery / invention).
 */
const FORBIDDEN_EVIDENCE_OVERRIDE_KEYS = new Set([
  "forecastExpectedDemandUnits",
  "forecastEligibility",
  "forecastConfidence",
  "m7Eligible",
  "productionDecisionCreationEligible",
  "productionApprovalEligible",
  "claimsProductionForecastApproval",
  "claimsM7ProductionEligibility",
  "algorithmApproved",
  "trustedCompleteDates",
  "fabricatedDemand",
  "decisionInput",
]);

/**
 * Bind structurally revalidated fresh-reader-shaped evidence into a typed
 * preparation result. Always production-ineligible for M7 forecast fields.
 * Does not authenticate DB/RPC origin.
 */
export function bindPublishedForecastEvidence(
  request: Pe1aPublishedForecastBindRequest,
): Pe1aPublishedForecastBindingResult {
  const envelope = validateRequestEnvelope(request);
  if (envelope) {
    return envelope;
  }

  const grain = cloneGrain(request.trustedGrain);
  if (!grain.ok) {
    return grain.rejection;
  }

  const parsed = parseAndValidateEvidence(request.evidence, grain.value);
  if (!parsed.ok) {
    return parsed;
  }

  const observed = parsed.observed;
  const mappingNotes: Pe1aMappingNoteCode[] = [
    "FORECAST_FORCED_INELIGIBLE",
    "AGE_POLICY_NOT_APPROVED",
    "CHECK_TIME_FRESHNESS_ONLY",
    "OBSERVED_DEMAND_NOT_DECISION_INPUT",
  ];

  if (observed.technicalNumericEligible) {
    mappingNotes.push("TECHNICAL_NUMERIC_SIGNAL_OBSERVED");
    mappingNotes.push("DISPOSITION_TECHNICALLY_ELIGIBLE");
  } else {
    mappingNotes.push("TECHNICAL_NUMERIC_SIGNAL_ABSENT");
    mappingNotes.push(dispositionNote(observed.disposition));
  }

  const reasonCodes = Object.freeze(mapReasonCodes(observed.disposition));

  const success = Object.freeze({
    ok: true as const,
    binderVersion: M6_PE1A_PUBLISHED_FORECAST_BINDER_VERSION_V1,
    grain: Object.freeze({ ...grain.value }),
    observed: Object.freeze({ ...observed }),
    forecastEligibility: "ineligible" as const,
    forecastExpectedDemandUnits: null,
    forecastConfidence: "low" as const,
    reasonCodes,
    mappingNotes: Object.freeze([...mappingNotes]),
    provenance: hardFalseProvenance(),
    warnings: WARNINGS,
    productionCreateBlockedUntil: PRODUCTION_CREATE_GATES,
  });

  return mintTrustedBindingSuccess(success);
}

/**
 * Runtime gate for future consumers — forged plain objects fail closed.
 */
export function isPe1aTrustedPublishedForecastBindingSuccess(
  value: unknown,
): value is Pe1aPublishedForecastBindingSuccess {
  return (
    typeof value === "object" &&
    value !== null &&
    mintedTrustedPublishedForecastBindings.has(value) &&
    (value as { ok?: unknown }).ok === true
  );
}

function mintTrustedBindingSuccess(
  success: Pe1aPublishedForecastBindingSuccess,
): Pe1aPublishedForecastBindingSuccess {
  mintedTrustedPublishedForecastBindings.add(success);
  return success;
}

function hardFalseProvenance(): Pe1aHardFalseProvenance {
  return Object.freeze({
    audience: "internal_preparation" as const,
    evidenceScope: "m6_published_forecast_preparation_only" as const,
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
  });
}

function reject(
  code: Pe1aBindingFailureCode,
  detail: string,
): Pe1aPublishedForecastBindingRejection {
  return Object.freeze({
    ok: false as const,
    binderVersion: M6_PE1A_PUBLISHED_FORECAST_BINDER_VERSION_V1,
    code,
    detail,
    provenance: hardFalseProvenance(),
  });
}

function validateRequestEnvelope(
  request: Pe1aPublishedForecastBindRequest,
): Pe1aPublishedForecastBindingRejection | null {
  if (request === null || typeof request !== "object") {
    return reject(
      "BINDING_ATTESTATION_INVALID",
      "PE1.a binding request is required.",
    );
  }

  if (Array.isArray(request)) {
    return reject(
      "CROSS_GRAIN_AGGREGATION_FORBIDDEN",
      "PE1.a forbids array / multi-grain request envelopes.",
    );
  }

  if (
    request.binderVersion !== M6_PE1A_PUBLISHED_FORECAST_BINDER_VERSION_V1 ||
    request.bindingAttestation !== M6_PE1A_BINDING_ATTESTATION_V1
  ) {
    return reject(
      "BINDING_ATTESTATION_INVALID",
      "binderVersion/bindingAttestation must be m6-pe1a published forecast binding v1.",
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
      "PE1.a rejects merchant/production/algorithm approval claims.",
    );
  }

  // Reject decision-field / eligibility bypass keys on the request surface.
  const asRecord = request as unknown as Record<string, unknown>;
  for (const key of FORBIDDEN_REQUEST_BYPASS_KEYS) {
    if (Object.prototype.hasOwnProperty.call(asRecord, key)) {
      return reject(
        "PRODUCTION_TRUST_CLAIM_REJECTED",
        `PE1.a rejects caller-supplied "${key}" on the binding request.`,
      );
    }
  }

  if (asRecord.productionEligibilityAttestation !== undefined) {
    return reject(
      "PRODUCTION_TRUST_CLAIM_REJECTED",
      "PE1.a has no active production eligibility attestation.",
    );
  }

  return null;
}

function cloneGrain(
  value: unknown,
):
  | { ok: true; value: ForecastGrain }
  | { ok: false; rejection: Pe1aPublishedForecastBindingRejection } {
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

function parseAndValidateEvidence(
  evidence: unknown,
  trustedGrain: ForecastGrain,
):
  | { ok: true; observed: Pe1aObservedPublishedForecastEvidence }
  | Pe1aPublishedForecastBindingRejection {
  if (evidence === null || typeof evidence !== "object" || Array.isArray(evidence)) {
    return reject(
      "EVIDENCE_MALFORMED",
      "published forecast evidence must be a non-null object.",
    );
  }

  const payload = evidence as Record<string, unknown>;

  for (const key of FORBIDDEN_EVIDENCE_OVERRIDE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) {
      return reject(
        "EVIDENCE_UNTRUSTED",
        `published forecast evidence must not include "${key}".`,
      );
    }
  }

  if (payload.claimsPostCommitFreshness !== false) {
    return reject(
      "FRESHNESS_CLAIM_REJECTED",
      "claimsPostCommitFreshness must be false; forecast-age is not approved.",
    );
  }

  if (payload.freshnessLimitation !== M6_PE1A_CHECK_TIME_FRESHNESS_LIMITATION_V1) {
    return reject(
      "FRESHNESS_CLAIM_REJECTED",
      "freshnessLimitation must match the check-time / non-age-policy contract.",
    );
  }

  let evidenceGrain: ForecastGrain;
  try {
    evidenceGrain = parseEvidenceGrain(payload.grain);
  } catch (error) {
    return reject(
      "EVIDENCE_MALFORMED",
      error instanceof Error ? error.message : "evidence grain malformed.",
    );
  }

  if (!grainsEqual(evidenceGrain, trustedGrain)) {
    return reject(
      "GRAIN_MISMATCH",
      "evidence grain does not match trustedGrain.",
    );
  }

  const disposition = payload.disposition;

  if (disposition === "eligible") {
    return parseEligibleEvidence(payload);
  }

  if (typeof disposition !== "string" || !MISS_DISPOSITIONS.has(
    disposition as Pe1aPublishedForecastMissDisposition,
  )) {
    return reject(
      "EVIDENCE_MALFORMED",
      `unexpected published forecast disposition "${String(disposition)}".`,
    );
  }

  return parseMissEvidence(
    payload,
    disposition as Pe1aPublishedForecastMissDisposition,
  );
}

function parseEligibleEvidence(
  payload: Record<string, unknown>,
):
  | { ok: true; observed: Pe1aObservedPublishedForecastEvidence }
  | Pe1aPublishedForecastBindingRejection {
  if (payload.m7NumericEligible !== true) {
    return reject(
      "CONFLICTING_EVIDENCE",
      "eligible disposition requires m7NumericEligible true.",
    );
  }

  const dailyDemand = payload.dailyDemand;
  if (
    typeof dailyDemand !== "number" ||
    !Number.isFinite(dailyDemand) ||
    dailyDemand < 0
  ) {
    return reject(
      "EVIDENCE_MALFORMED",
      "eligible disposition requires finite nonnegative dailyDemand.",
    );
  }

  const confidence = payload.confidence;
  if (confidence !== "medium" && confidence !== "high") {
    return reject(
      "CONFLICTING_EVIDENCE",
      "eligible disposition requires confidence medium or high.",
    );
  }

  const mode = payload.mode;
  if (mode !== "standard" && mode !== "limited_history") {
    return reject(
      "CONFLICTING_EVIDENCE",
      "eligible disposition requires standard or limited_history mode.",
    );
  }

  const dataSufficiency = payload.dataSufficiency;
  if (dataSufficiency !== "sufficient" && dataSufficiency !== "limited") {
    return reject(
      "CONFLICTING_EVIDENCE",
      "eligible disposition requires sufficient or limited dataSufficiency.",
    );
  }

  try {
    return {
      ok: true,
      observed: {
        disposition: "eligible",
        technicalNumericEligible: true,
        dailyDemandObserved: dailyDemand,
        confidenceObserved: confidence,
        modeObserved: mode,
        dataSufficiencyObserved: dataSufficiency,
        publicationId: assertUuid(payload.publicationId, "publicationId"),
        forecastRunId: assertUuid(payload.forecastRunId, "forecastRunId"),
        skuForecastId: assertUuid(payload.skuForecastId, "skuForecastId"),
        sourceToken: assertSourceToken(payload.sourceToken),
        forecastAsOf: assertDate(payload.forecastAsOf, "forecastAsOf"),
        lookbackDays: assertLookback(payload.lookbackDays),
        claimsPostCommitFreshness: false,
        freshnessLimitation: M6_PE1A_CHECK_TIME_FRESHNESS_LIMITATION_V1,
      },
    };
  } catch (error) {
    return reject(
      "IDENTITY_INVALID",
      error instanceof Error ? error.message : "eligible evidence identity invalid.",
    );
  }
}

function parseMissEvidence(
  payload: Record<string, unknown>,
  disposition: Pe1aPublishedForecastMissDisposition,
):
  | { ok: true; observed: Pe1aObservedPublishedForecastEvidence }
  | Pe1aPublishedForecastBindingRejection {
  if (payload.m7NumericEligible !== false) {
    return reject(
      "CONFLICTING_EVIDENCE",
      "miss dispositions require m7NumericEligible false.",
    );
  }

  if (payload.dailyDemand !== null) {
    return reject(
      "CONFLICTING_EVIDENCE",
      "miss dispositions require dailyDemand null.",
    );
  }

  try {
    return {
      ok: true,
      observed: {
        disposition,
        technicalNumericEligible: false,
        dailyDemandObserved: null,
        confidenceObserved: optionalConfidence(payload.confidence),
        modeObserved: optionalMode(payload.mode),
        dataSufficiencyObserved: optionalSufficiency(payload.dataSufficiency),
        publicationId: optionalUuid(payload.publicationId, "publicationId"),
        forecastRunId: optionalUuid(payload.forecastRunId, "forecastRunId"),
        skuForecastId: optionalUuid(payload.skuForecastId, "skuForecastId"),
        sourceToken: optionalSourceToken(payload.sourceToken),
        forecastAsOf: optionalDate(payload.forecastAsOf, "forecastAsOf"),
        lookbackDays: optionalLookback(payload.lookbackDays),
        claimsPostCommitFreshness: false,
        freshnessLimitation: M6_PE1A_CHECK_TIME_FRESHNESS_LIMITATION_V1,
      },
    };
  } catch (error) {
    return reject(
      "IDENTITY_INVALID",
      error instanceof Error ? error.message : "miss evidence identity invalid.",
    );
  }
}

function parseEvidenceGrain(value: unknown): ForecastGrain {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("evidence grain is malformed.");
  }

  const row = value as Record<string, unknown>;
  return {
    organizationId: assertUuid(row.organizationId, "grain.organizationId"),
    storeId: assertUuid(row.storeId, "grain.storeId"),
    locationId: assertUuid(row.locationId, "grain.locationId"),
    variantId: assertUuid(row.variantId, "grain.variantId"),
  };
}

function grainsEqual(left: ForecastGrain, right: ForecastGrain): boolean {
  return (
    left.organizationId.toLowerCase() === right.organizationId.toLowerCase() &&
    left.storeId.toLowerCase() === right.storeId.toLowerCase() &&
    left.locationId.toLowerCase() === right.locationId.toLowerCase() &&
    left.variantId.toLowerCase() === right.variantId.toLowerCase()
  );
}

function mapReasonCodes(
  disposition: Pe1aPublishedForecastDisposition,
): InventoryDecisionReasonCode[] {
  switch (disposition) {
    case "FORECAST_CONFIDENCE_LOW":
      return ["FORECAST_CONFIDENCE_LOW"];
    case "eligible":
      // Technically numeric-usable, but production-ineligible → unavailable for decisions.
      return ["FORECAST_UNAVAILABLE"];
    case "ABSENT":
    case "STALE":
    case "PENDING_CORRECTION":
    case "FORECAST_UNAVAILABLE":
    default:
      return ["FORECAST_UNAVAILABLE"];
  }
}

function dispositionNote(
  disposition: Pe1aPublishedForecastDisposition,
): Pe1aMappingNoteCode {
  switch (disposition) {
    case "ABSENT":
      return "DISPOSITION_ABSENT";
    case "STALE":
      return "DISPOSITION_STALE";
    case "PENDING_CORRECTION":
      return "DISPOSITION_PENDING_CORRECTION";
    case "FORECAST_CONFIDENCE_LOW":
      return "DISPOSITION_FORECAST_CONFIDENCE_LOW";
    case "eligible":
      return "DISPOSITION_TECHNICALLY_ELIGIBLE";
    case "FORECAST_UNAVAILABLE":
    default:
      return "DISPOSITION_FORECAST_UNAVAILABLE";
  }
}

function assertUuid(value: unknown, field: string): string {
  if (typeof value !== "string" || !UUID_RE.test(value)) {
    throw new Error(`${field} must be a UUID.`);
  }
  return value.toLowerCase();
}

function optionalUuid(value: unknown, field: string): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return assertUuid(value, field);
}

function assertSourceToken(value: unknown): string {
  if (typeof value !== "string" || !SOURCE_TOKEN_RE.test(value)) {
    throw new Error("sourceToken must be an md5 hex digest.");
  }
  return value.toLowerCase();
}

function optionalSourceToken(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return assertSourceToken(value);
}

function assertDate(value: unknown, field: string): string {
  if (typeof value !== "string" || !DATE_RE.test(value)) {
    throw new Error(`${field} must be a YYYY-MM-DD date.`);
  }
  return value;
}

function optionalDate(value: unknown, field: string): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return assertDate(value, field);
}

function assertLookback(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > 365
  ) {
    throw new Error("lookbackDays must be an integer from 1 to 365.");
  }
  return value;
}

function optionalLookback(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  return assertLookback(value);
}

function optionalConfidence(
  value: unknown,
): "high" | "medium" | "low" | "none" | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (
    value === "high" ||
    value === "medium" ||
    value === "low" ||
    value === "none"
  ) {
    return value;
  }
  throw new Error("confidence must be high, medium, low, none, or null.");
}

function optionalMode(
  value: unknown,
): "standard" | "limited_history" | "unavailable" | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (
    value === "standard" ||
    value === "limited_history" ||
    value === "unavailable"
  ) {
    return value;
  }
  throw new Error("mode must be standard, limited_history, unavailable, or null.");
}

function optionalSufficiency(
  value: unknown,
): "sufficient" | "limited" | "insufficient" | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (
    value === "sufficient" ||
    value === "limited" ||
    value === "insufficient"
  ) {
    return value;
  }
  throw new Error(
    "dataSufficiency must be sufficient, limited, insufficient, or null.",
  );
}

// Keep ConfidenceLevel referenced so decision confidence typing stays aligned.
export type Pe1aDecisionForecastConfidence = Extract<ConfidenceLevel, "low">;
