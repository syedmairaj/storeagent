/**
 * M7-PB1.a — pure trusted M5 metric → InventoryDecisionInput mapper.
 *
 * Preparation / diagnostic binding only. Never production create, persist,
 * merchant approval, E4, workers, or forecast invention.
 *
 * Authority: docs/M7_PB1_TRUSTED_METRIC_DECISION_BINDING_CONTRACT.md
 *
 * PB1.b offline diagnostic evaluation consumes only WeakSet-minted success
 * results from this module (see metric-decision-diagnostic.ts). This mapper
 * never invokes the decision engine.
 */

import type { InventoryActionEvidence } from "@/lib/commerce-domain/types";
import {
  calculateOverstockRisk,
  calculateRecommendedOrderQuantity,
  calculateStockoutRisk,
} from "@/lib/metrics/inventory-math";
import { SKU_DAILY_METRIC_ALGORITHM_VERSION } from "@/lib/metrics/sku-daily-metric-record";

import type {
  InventoryDecisionInput,
  InventoryDecisionResult,
} from "./types";

/**
 * Opaque mint gate: only bindMetricToDecisionInput may register successes.
 * PB1.b refuses forged plain objects that merely look like a success result.
 */
const mintedTrustedBindingSuccesses = new WeakSet<object>();

export const M7_PB1_METRIC_DECISION_BINDING_VERSION_V1 =
  "m7-pb1-metric-decision-binding-v1" as const;

export const M7_PB1_METRIC_BINDING_ATTESTATION_V1 =
  "m7-pb1-metric-binding-v1" as const;

export const M7_PB1_TRUSTED_SUPPLIER_PLANNING_ATTESTATION_V1 =
  "pb1_trusted_supplier_planning_v1" as const;

export const M7_PB1_METRIC_SOURCE_WATERMARK_VERSION_V1 =
  "m7-pb1-metric-source-watermark-v1" as const;

/**
 * Decision grain — same shape as M7.0 / M7.1 decision grain.
 * Defined locally so PB1.a never imports the fixture evaluation module.
 */
export interface M7DecisionGrain {
  organizationId: string;
  storeId: string;
  locationId: string;
  variantId: string;
}

export interface Pb1TrustedTenantScope {
  organizationId: string;
  storeId: string;
  /**
   * Trusted `stores.timezone` for `storeId` (caller-loaded).
   * Required so TIMEZONE_MISMATCH can be enforced without inventing TZ.
   */
  storeTimeZone: string;
}

export interface TrustedSupplierPlanningFacts {
  leadTimeDays: number;
  sourceAttestation: typeof M7_PB1_TRUSTED_SUPPLIER_PLANNING_ATTESTATION_V1;
}

export interface Pb1SkuDailyMetricProjection {
  organizationId: string;
  storeId: string;
  locationId: string;
  variantId: string;
  metricDate: string;
  algorithmVersion: string;
  updatedAt: string;
  createdAt?: string;

  availableQuantity: number | null;
  eligibleIncomingQuantity: number | null;
  eligibleIncomingReasonCode: string | null;

  salesVelocity30d: number | null;
  daysOfStock: number | null;
  safetyStock: number | null;
  reorderPoint: number | null;
  targetStock: number | null;
  inventoryAgeDays: number | null;
  demandTrend: "rising" | "stable" | "falling" | "unknown";
}

export interface Pb1MetricDecisionBindingRequest {
  bindingVersion: typeof M7_PB1_METRIC_DECISION_BINDING_VERSION_V1;

  trustedScope: Pb1TrustedTenantScope;

  grain: M7DecisionGrain;

  /** Exactly one M5 row projection (already loaded by trusted caller). */
  metric: Pb1SkuDailyMetricProjection;

  pinnedTimeZone: string;

  bindingAttestation: typeof M7_PB1_METRIC_BINDING_ATTESTATION_V1;

  forecastEligibility: "ineligible";

  claimsMerchantFacing: false;
  claimsProductionForecastApproval: false;
  claimsM7ProductionEligibility: false;
  algorithmApproved: false;

  supplierPlanning?: TrustedSupplierPlanningFacts | null;

  deriveRecommendedOrderQuantity?: boolean;
  deriveStockoutRisk?: boolean;
  deriveOverstockRisk?: boolean;

  /**
   * PB1.b only. PB1.a ignores this flag and never invokes the engine.
   */
  runDiagnosticDecision?: boolean;

  stalenessPolicy?: {
    maxAgeMs: number;
    relativeTo: string;
  } | null;

  configurationVersion?: string;
}

export type Pb1BindingFailureCode =
  | "BINDING_ATTESTATION_INVALID"
  | "FORECAST_ELIGIBILITY_INVALID"
  | "PRODUCTION_TRUST_CLAIM_REJECTED"
  | "FOREIGN_TENANT_REJECTED"
  | "FOREIGN_STORE_REJECTED"
  | "GRAIN_MISMATCH"
  | "UNSUPPORTED_METRIC_ALGORITHM"
  | "TIMEZONE_INVALID"
  | "TIMEZONE_MISMATCH"
  | "METRIC_STALE"
  | "METRIC_ROW_INVARIANT_VIOLATION"
  | "INCOMING_STATE_CONTRADICTION"
  | "NUMERIC_INVALID"
  | "SUPPLIER_FACTS_INVALID"
  | "MULTI_ROW_INPUT"
  | "CROSS_GRAIN_AGGREGATION_FORBIDDEN";

export type Pb1MappingNoteCode =
  | "FORECAST_FORCED_INELIGIBLE"
  | "INCOMING_STATE_UNKNOWN_PASSTHROUGH"
  | "INVENTORY_AGE_UNKNOWN_PASSTHROUGH"
  | "LEAD_TIME_ABSENT"
  | "LEAD_TIME_FROM_TRUSTED_SUPPLIER_FACTS"
  | "DEMAND_TREND_UNKNOWN_TO_NULL"
  | "DATA_QUALITY_SCORE_ABSENT"
  | "ROQ_NOT_DERIVED"
  | "ROQ_DERIVED"
  | "RISK_NOT_DERIVED"
  | "RISK_DERIVED_PARTIAL_OR_FULL"
  | "DIAGNOSTIC_DECISION_RUN";

export type Pb1ProductionCreateGate =
  | "M6_PRODUCTION_FORECAST_ELIGIBILITY_APPROVED"
  | "TRUSTED_INCOMING_EVIDENCE_AVAILABLE"
  | "TRUSTED_M5_SOURCE_OF_CREATE_WRITER_APPROVED"
  | "M7_3_MERCHANT_APPROVABLE_PREDICATE_APPROVED";

export interface Pb1HardFalseProvenance {
  audience: "local_developer" | "internal_preparation";
  evidenceScope: "m5_metric_bound_preparation_only";
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
}

export interface Pb1MetricDecisionBindingRejection {
  ok: false;
  bindingVersion: typeof M7_PB1_METRIC_DECISION_BINDING_VERSION_V1;
  code: Pb1BindingFailureCode;
  detail: string;
  provenance: Pb1HardFalseProvenance;
}

export interface Pb1MetricDecisionBindingSuccess {
  ok: true;
  bindingVersion: typeof M7_PB1_METRIC_DECISION_BINDING_VERSION_V1;
  grain: M7DecisionGrain;
  metricDate: string;
  metricAlgorithmVersion: typeof SKU_DAILY_METRIC_ALGORITHM_VERSION;
  pinnedTimeZone: string;
  metricSourceWatermark: string;
  decisionInput: InventoryDecisionInput;
  mappingNotes: readonly Pb1MappingNoteCode[];
  /**
   * Present only after PB1.b offline diagnostic evaluation.
   * Must not be fed to production persist/UI approval paths.
   */
  diagnosticDecision?: InventoryDecisionResult;
  diagnosticEvidence?: InventoryActionEvidence;
  provenance: Pb1HardFalseProvenance;
  warnings: readonly [
    "m5_metric_bound_preparation_only",
    "NOT_merchant_facing",
    "NOT_production_activation",
    "NOT_production_forecast",
    "NOT_production_decision_create",
    "NOT_m7_3_approvable",
    "NOT_engine_bound_brief",
  ];
  productionCreateBlockedUntil: readonly Pb1ProductionCreateGate[];
}

export type Pb1MetricDecisionBindingResult =
  | Pb1MetricDecisionBindingRejection
  | Pb1MetricDecisionBindingSuccess;

const WARNINGS = Object.freeze([
  "m5_metric_bound_preparation_only",
  "NOT_merchant_facing",
  "NOT_production_activation",
  "NOT_production_forecast",
  "NOT_production_decision_create",
  "NOT_m7_3_approvable",
  "NOT_engine_bound_brief",
] as const);

const PRODUCTION_CREATE_GATES = Object.freeze([
  "M6_PRODUCTION_FORECAST_ELIGIBILITY_APPROVED",
  "TRUSTED_INCOMING_EVIDENCE_AVAILABLE",
  "TRUSTED_M5_SOURCE_OF_CREATE_WRITER_APPROVED",
  "M7_3_MERCHANT_APPROVABLE_PREDICATE_APPROVED",
] as const satisfies readonly Pb1ProductionCreateGate[]);

const DEMAND_TRENDS = new Set(["rising", "stable", "falling", "unknown"]);

const METRIC_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Map one trusted M5 sku_daily_metrics projection into InventoryDecisionInput.
 * Fail-closed. Pure / deterministic. No I/O.
 */
export function bindMetricToDecisionInput(
  request: Pb1MetricDecisionBindingRequest,
): Pb1MetricDecisionBindingResult {
  const early = validateRequestEnvelope(request);
  if (early) {
    return early;
  }

  const grain = cloneGrain(request.grain);
  const metric = request.metric;

  if (Array.isArray(metric)) {
    return reject("MULTI_ROW_INPUT", "PB1 accepts exactly one metric row.");
  }

  if (metric === null || typeof metric !== "object") {
    return reject(
      "METRIC_ROW_INVARIANT_VIOLATION",
      "metric projection is required.",
    );
  }

  const scopeOrg = trimIdentity(
    request.trustedScope.organizationId,
    "trustedScope.organizationId",
  );
  if (!scopeOrg.ok) {
    return reject("FOREIGN_TENANT_REJECTED", scopeOrg.detail);
  }
  const scopeStore = trimIdentity(
    request.trustedScope.storeId,
    "trustedScope.storeId",
  );
  if (!scopeStore.ok) {
    return reject("FOREIGN_STORE_REJECTED", scopeStore.detail);
  }

  const metricOrg = trimIdentity(metric.organizationId, "metric.organizationId");
  if (!metricOrg.ok) {
    return reject("METRIC_ROW_INVARIANT_VIOLATION", metricOrg.detail);
  }
  const metricStore = trimIdentity(metric.storeId, "metric.storeId");
  if (!metricStore.ok) {
    return reject("METRIC_ROW_INVARIANT_VIOLATION", metricStore.detail);
  }
  const metricLocation = trimIdentity(metric.locationId, "metric.locationId");
  if (!metricLocation.ok) {
    return reject("METRIC_ROW_INVARIANT_VIOLATION", metricLocation.detail);
  }
  const metricVariant = trimIdentity(metric.variantId, "metric.variantId");
  if (!metricVariant.ok) {
    return reject("METRIC_ROW_INVARIANT_VIOLATION", metricVariant.detail);
  }

  if (scopeOrg.value !== metricOrg.value) {
    return reject(
      "FOREIGN_TENANT_REJECTED",
      "trustedScope.organizationId does not match metric.organizationId.",
    );
  }

  if (scopeStore.value !== metricStore.value) {
    return reject(
      "FOREIGN_STORE_REJECTED",
      "trustedScope.storeId does not match metric.storeId.",
    );
  }

  if (
    grain.organizationId !== metricOrg.value ||
    grain.storeId !== metricStore.value ||
    grain.locationId !== metricLocation.value ||
    grain.variantId !== metricVariant.value
  ) {
    return reject(
      "GRAIN_MISMATCH",
      "grain identity does not match metric row identity.",
    );
  }

  if (metric.algorithmVersion !== SKU_DAILY_METRIC_ALGORITHM_VERSION) {
    return reject(
      "UNSUPPORTED_METRIC_ALGORITHM",
      `algorithmVersion must be ${SKU_DAILY_METRIC_ALGORITHM_VERSION}.`,
    );
  }

  const metricDate = assertMetricDate(metric.metricDate);
  if (!metricDate.ok) {
    return reject("METRIC_ROW_INVARIANT_VIOLATION", metricDate.detail);
  }

  const updatedAt = assertIsoTimestamptz(metric.updatedAt, "metric.updatedAt");
  if (!updatedAt.ok) {
    return reject("METRIC_ROW_INVARIANT_VIOLATION", updatedAt.detail);
  }

  const pinnedTimeZone = request.pinnedTimeZone.trim();
  const storeTimeZone = request.trustedScope.storeTimeZone.trim();

  if (!isRecognizedIanaTimeZone(pinnedTimeZone)) {
    return reject(
      "TIMEZONE_INVALID",
      "pinnedTimeZone must be a recognized IANA timezone.",
    );
  }

  if (!isRecognizedIanaTimeZone(storeTimeZone)) {
    return reject(
      "TIMEZONE_INVALID",
      "trustedScope.storeTimeZone must be a recognized IANA timezone.",
    );
  }

  if (pinnedTimeZone !== storeTimeZone) {
    return reject(
      "TIMEZONE_MISMATCH",
      "pinnedTimeZone must match trusted store timezone.",
    );
  }

  const stale = checkStaleness(request.stalenessPolicy, updatedAt.value);
  if (stale) {
    return stale;
  }

  const incoming = mapIncomingState(metric);
  if (!incoming.ok) {
    return incoming;
  }

  // Decision-input contradiction (defensive; correct M5 coupling rejects earlier).
  if (
    !incoming.value.incomingStateKnown &&
    incoming.value.validIncomingQuantity !== null
  ) {
    return reject(
      "INCOMING_STATE_CONTRADICTION",
      "incomingStateKnown=false cannot carry a numeric validIncomingQuantity.",
    );
  }

  const availableQuantity = assertNullableNonNegativeInteger(
    metric.availableQuantity,
    "availableQuantity",
  );
  if (!availableQuantity.ok) {
    return reject("NUMERIC_INVALID", availableQuantity.detail);
  }

  const salesVelocity30d = assertNullableNonNegativeFinite(
    metric.salesVelocity30d,
    "salesVelocity30d",
  );
  if (!salesVelocity30d.ok) {
    return reject("NUMERIC_INVALID", salesVelocity30d.detail);
  }

  const daysOfStock = assertNullableNonNegativeFinite(
    metric.daysOfStock,
    "daysOfStock",
  );
  if (!daysOfStock.ok) {
    return reject("NUMERIC_INVALID", daysOfStock.detail);
  }

  const safetyStock = assertNullableNonNegativeInteger(
    metric.safetyStock,
    "safetyStock",
  );
  if (!safetyStock.ok) {
    return reject("NUMERIC_INVALID", safetyStock.detail);
  }

  const reorderPoint = assertNullableNonNegativeInteger(
    metric.reorderPoint,
    "reorderPoint",
  );
  if (!reorderPoint.ok) {
    return reject("NUMERIC_INVALID", reorderPoint.detail);
  }

  const targetStock = assertNullableNonNegativeInteger(
    metric.targetStock,
    "targetStock",
  );
  if (!targetStock.ok) {
    return reject("NUMERIC_INVALID", targetStock.detail);
  }

  const inventoryAgeDays = assertNullableNonNegativeInteger(
    metric.inventoryAgeDays,
    "inventoryAgeDays",
  );
  if (!inventoryAgeDays.ok) {
    return reject("NUMERIC_INVALID", inventoryAgeDays.detail);
  }

  if (
    typeof metric.demandTrend !== "string" ||
    !DEMAND_TRENDS.has(metric.demandTrend)
  ) {
    return reject(
      "METRIC_ROW_INVARIANT_VIOLATION",
      "demandTrend must be rising, stable, falling, or unknown.",
    );
  }

  const mappingNotes: Pb1MappingNoteCode[] = [
    "FORECAST_FORCED_INELIGIBLE",
    "DATA_QUALITY_SCORE_ABSENT",
  ];

  if (!incoming.value.incomingStateKnown) {
    mappingNotes.push("INCOMING_STATE_UNKNOWN_PASSTHROUGH");
  }

  if (inventoryAgeDays.value === null) {
    mappingNotes.push("INVENTORY_AGE_UNKNOWN_PASSTHROUGH");
  }

  let demandTrend: InventoryDecisionInput["demandTrend"];
  if (metric.demandTrend === "unknown") {
    demandTrend = null;
    mappingNotes.push("DEMAND_TREND_UNKNOWN_TO_NULL");
  } else {
    demandTrend = metric.demandTrend;
  }

  const leadTime = resolveLeadTime(request.supplierPlanning);
  if (!leadTime.ok) {
    return leadTime;
  }
  mappingNotes.push(leadTime.note);

  let recommendedOrderQuantity: number | null = null;
  const deriveRoq = request.deriveRecommendedOrderQuantity === true;
  if (deriveRoq) {
    const derived = calculateRecommendedOrderQuantity({
      targetStockUnits: targetStock.value,
      availableQuantity: availableQuantity.value,
      validIncomingQuantity: incoming.value.validIncomingQuantity,
      incomingStateKnown: incoming.value.incomingStateKnown,
    });
    recommendedOrderQuantity = derived.value;
    mappingNotes.push(
      derived.value === null ? "ROQ_NOT_DERIVED" : "ROQ_DERIVED",
    );
  } else {
    mappingNotes.push("ROQ_NOT_DERIVED");
  }

  let stockoutRisk: InventoryDecisionInput["stockoutRisk"] = null;
  let overstockRisk: InventoryDecisionInput["overstockRisk"] = null;
  const deriveStockout = request.deriveStockoutRisk === true;
  const deriveOverstock = request.deriveOverstockRisk === true;

  if (deriveStockout) {
    // safetyStockDays is not on sku_daily_metrics; do not invent from units.
    const result = calculateStockoutRisk({
      daysOfStock: daysOfStock.value,
      leadTimeDays: leadTime.value,
      safetyStockDays: null,
    });
    stockoutRisk = result.value;
  }

  if (deriveOverstock) {
    const result = calculateOverstockRisk({
      availableQuantity: availableQuantity.value,
      validIncomingQuantity: incoming.value.validIncomingQuantity,
      incomingStateKnown: incoming.value.incomingStateKnown,
      targetStockUnits: targetStock.value,
    });
    overstockRisk = result.value;
  }

  if (deriveStockout || deriveOverstock) {
    mappingNotes.push(
      stockoutRisk !== null || overstockRisk !== null
        ? "RISK_DERIVED_PARTIAL_OR_FULL"
        : "RISK_NOT_DERIVED",
    );
  } else {
    mappingNotes.push("RISK_NOT_DERIVED");
  }

  const decisionInput = Object.freeze({
    availableQuantity: availableQuantity.value,
    validIncomingQuantity: incoming.value.validIncomingQuantity,
    incomingStateKnown: incoming.value.incomingStateKnown,
    demandVelocity: salesVelocity30d.value,
    daysOfStock: daysOfStock.value,
    leadTimeDays: leadTime.value,
    safetyStockUnits: safetyStock.value,
    reorderPointUnits: reorderPoint.value,
    targetStockUnits: targetStock.value,
    recommendedOrderQuantity,
    inventoryAgeDays: inventoryAgeDays.value,
    demandTrend,
    stockoutRisk,
    overstockRisk,
    forecastExpectedDemandUnits: null,
    forecastConfidence: "low" as const,
    dataQualityScore: null,
  });

  const success = Object.freeze({
    ok: true as const,
    bindingVersion: M7_PB1_METRIC_DECISION_BINDING_VERSION_V1,
    grain: Object.freeze(grain),
    metricDate: metricDate.value,
    metricAlgorithmVersion: SKU_DAILY_METRIC_ALGORITHM_VERSION,
    pinnedTimeZone,
    metricSourceWatermark: buildMetricSourceWatermark({
      metricDate: metricDate.value,
      algorithmVersion: SKU_DAILY_METRIC_ALGORITHM_VERSION,
      updatedAt: updatedAt.value,
    }),
    decisionInput,
    mappingNotes: Object.freeze([...mappingNotes]),
    provenance: hardFalseProvenance(),
    warnings: WARNINGS,
    productionCreateBlockedUntil: PRODUCTION_CREATE_GATES,
  });

  return mintTrustedBindingSuccess(success);
}

/**
 * Runtime gate used by PB1.b — forged plain objects fail closed.
 */
export function isPb1TrustedMetricBindingSuccess(
  value: unknown,
): value is Pb1MetricDecisionBindingSuccess {
  return (
    typeof value === "object" &&
    value !== null &&
    mintedTrustedBindingSuccesses.has(value) &&
    (value as { ok?: unknown }).ok === true
  );
}

function mintTrustedBindingSuccess(
  success: Pb1MetricDecisionBindingSuccess,
): Pb1MetricDecisionBindingSuccess {
  mintedTrustedBindingSuccesses.add(success);
  return success;
}

export function buildMetricSourceWatermark(parts: {
  metricDate: string;
  algorithmVersion: string;
  updatedAt: string;
}): string {
  return [
    M7_PB1_METRIC_SOURCE_WATERMARK_VERSION_V1,
    parts.metricDate,
    parts.algorithmVersion,
    parts.updatedAt,
  ].join("|");
}

function hardFalseProvenance(): Pb1HardFalseProvenance {
  return Object.freeze({
    audience: "internal_preparation" as const,
    evidenceScope: "m5_metric_bound_preparation_only" as const,
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
  });
}

function reject(
  code: Pb1BindingFailureCode,
  detail: string,
): Pb1MetricDecisionBindingRejection {
  return Object.freeze({
    ok: false as const,
    bindingVersion: M7_PB1_METRIC_DECISION_BINDING_VERSION_V1,
    code,
    detail,
    provenance: hardFalseProvenance(),
  });
}

function validateRequestEnvelope(
  request: Pb1MetricDecisionBindingRequest,
): Pb1MetricDecisionBindingRejection | null {
  if (request === null || typeof request !== "object") {
    return reject(
      "BINDING_ATTESTATION_INVALID",
      "PB1 binding request is required.",
    );
  }

  if (
    (request as { metrics?: unknown }).metrics !== undefined ||
    (request as { grains?: unknown }).grains !== undefined
  ) {
    return reject(
      "CROSS_GRAIN_AGGREGATION_FORBIDDEN",
      "PB1 forbids multi-grain aggregation in one call.",
    );
  }

  if (
    request.bindingVersion !== M7_PB1_METRIC_DECISION_BINDING_VERSION_V1 ||
    request.bindingAttestation !== M7_PB1_METRIC_BINDING_ATTESTATION_V1
  ) {
    return reject(
      "BINDING_ATTESTATION_INVALID",
      "bindingVersion/bindingAttestation must be m7-pb1 metric binding v1.",
    );
  }

  if (request.forecastEligibility !== "ineligible") {
    return reject(
      "FORECAST_ELIGIBILITY_INVALID",
      'forecastEligibility must be exactly "ineligible".',
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
      "PB1 rejects merchant/production/algorithm approval claims.",
    );
  }

  if (
    request.trustedScope === null ||
    typeof request.trustedScope !== "object"
  ) {
    return reject("FOREIGN_TENANT_REJECTED", "trustedScope is required.");
  }

  if (
    typeof request.trustedScope.storeTimeZone !== "string" ||
    request.trustedScope.storeTimeZone.trim().length === 0
  ) {
    return reject(
      "TIMEZONE_INVALID",
      "trustedScope.storeTimeZone is required.",
    );
  }

  if (request.grain === null || typeof request.grain !== "object") {
    return reject("GRAIN_MISMATCH", "grain is required.");
  }

  for (const [field, value] of [
    ["grain.organizationId", request.grain.organizationId],
    ["grain.storeId", request.grain.storeId],
    ["grain.locationId", request.grain.locationId],
    ["grain.variantId", request.grain.variantId],
  ] as const) {
    if (typeof value !== "string" || value.trim().length === 0) {
      return reject("GRAIN_MISMATCH", `${field} is required.`);
    }
  }

  if (typeof request.pinnedTimeZone !== "string") {
    return reject(
      "TIMEZONE_INVALID",
      "pinnedTimeZone must be a recognized IANA timezone.",
    );
  }

  return null;
}

function cloneGrain(grain: M7DecisionGrain): M7DecisionGrain {
  return {
    organizationId: grain.organizationId.trim(),
    storeId: grain.storeId.trim(),
    locationId: grain.locationId.trim(),
    variantId: grain.variantId.trim(),
  };
}

function trimIdentity(
  value: unknown,
  field: string,
): { ok: true; value: string } | { ok: false; detail: string } {
  if (typeof value !== "string" || value.trim().length === 0) {
    return { ok: false, detail: `${field} is required.` };
  }
  return { ok: true, value: value.trim() };
}

function assertMetricDate(
  value: unknown,
): { ok: true; value: string } | { ok: false; detail: string } {
  if (typeof value !== "string" || !METRIC_DATE_RE.test(value)) {
    return {
      ok: false,
      detail: "metricDate must be a YYYY-MM-DD calendar date.",
    };
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return {
      ok: false,
      detail: "metricDate must be a YYYY-MM-DD calendar date.",
    };
  }

  return { ok: true, value };
}

function assertIsoTimestamptz(
  value: unknown,
  field: string,
): { ok: true; value: string } | { ok: false; detail: string } {
  if (typeof value !== "string" || value.trim().length === 0) {
    return { ok: false, detail: `${field} is required.` };
  }
  const trimmed = value.trim();
  const ms = Date.parse(trimmed);
  if (!Number.isFinite(ms)) {
    return { ok: false, detail: `${field} must be a parseable ISO timestamptz.` };
  }
  return { ok: true, value: trimmed };
}

function isRecognizedIanaTimeZone(timeZone: string): boolean {
  if (timeZone.length === 0) {
    return false;
  }
  try {
    return Intl.supportedValuesOf("timeZone").includes(timeZone);
  } catch {
    try {
      Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
      return true;
    } catch {
      return false;
    }
  }
}

function checkStaleness(
  policy:
    | {
        maxAgeMs: number;
        relativeTo: string;
      }
    | null
    | undefined,
  updatedAt: string,
): Pb1MetricDecisionBindingRejection | null {
  if (policy === null || policy === undefined) {
    return null;
  }

  if (
    typeof policy !== "object" ||
    !Number.isFinite(policy.maxAgeMs) ||
    policy.maxAgeMs < 0
  ) {
    return reject(
      "METRIC_STALE",
      "stalenessPolicy.maxAgeMs must be a non-negative finite number.",
    );
  }

  const relative = assertIsoTimestamptz(
    policy.relativeTo,
    "stalenessPolicy.relativeTo",
  );
  if (!relative.ok) {
    return reject("METRIC_STALE", relative.detail);
  }

  const updatedMs = Date.parse(updatedAt);
  const relativeMs = Date.parse(relative.value);
  const ageMs = relativeMs - updatedMs;

  if (ageMs > policy.maxAgeMs) {
    return reject(
      "METRIC_STALE",
      "metric.updatedAt violates stalenessPolicy.maxAgeMs.",
    );
  }

  return null;
}

function mapIncomingState(
  metric: Pb1SkuDailyMetricProjection,
):
  | {
      ok: true;
      value: {
        incomingStateKnown: boolean;
        validIncomingQuantity: number | null;
      };
    }
  | Pb1MetricDecisionBindingRejection {
  const qty = metric.eligibleIncomingQuantity;
  const reason = metric.eligibleIncomingReasonCode;

  if (qty === null && reason !== null) {
    if (typeof reason !== "string" || reason.trim().length === 0) {
      return reject(
        "METRIC_ROW_INVARIANT_VIOLATION",
        "eligibleIncomingReasonCode must be non-blank when quantity is null.",
      );
    }
    return {
      ok: true,
      value: {
        incomingStateKnown: false,
        validIncomingQuantity: null,
      },
    };
  }

  if (qty !== null && reason === null) {
    const validated = assertNullableNonNegativeInteger(
      qty,
      "eligibleIncomingQuantity",
    );
    if (!validated.ok) {
      return reject("NUMERIC_INVALID", validated.detail);
    }
    return {
      ok: true,
      value: {
        incomingStateKnown: true,
        validIncomingQuantity: validated.value,
      },
    };
  }

  // null+null or non-null+non-null: M5 nullability/reason coupling broken.
  return reject(
    "METRIC_ROW_INVARIANT_VIOLATION",
    "eligible incoming quantity/reason nullability coupling is violated.",
  );
}

function resolveLeadTime(
  facts: TrustedSupplierPlanningFacts | null | undefined,
):
  | {
      ok: true;
      value: number | null;
      note: "LEAD_TIME_ABSENT" | "LEAD_TIME_FROM_TRUSTED_SUPPLIER_FACTS";
    }
  | Pb1MetricDecisionBindingRejection {
  if (facts === null || facts === undefined) {
    return {
      ok: true,
      value: null,
      note: "LEAD_TIME_ABSENT",
    };
  }

  if (typeof facts !== "object") {
    return reject(
      "SUPPLIER_FACTS_INVALID",
      "supplierPlanning payload is invalid.",
    );
  }

  if (
    facts.sourceAttestation !==
    M7_PB1_TRUSTED_SUPPLIER_PLANNING_ATTESTATION_V1
  ) {
    return reject(
      "SUPPLIER_FACTS_INVALID",
      "supplierPlanning.sourceAttestation is invalid.",
    );
  }

  if (
    typeof facts.leadTimeDays !== "number" ||
    !Number.isFinite(facts.leadTimeDays) ||
    facts.leadTimeDays < 0
  ) {
    return reject(
      "SUPPLIER_FACTS_INVALID",
      "supplierPlanning.leadTimeDays must be a non-negative finite number.",
    );
  }

  return {
    ok: true,
    value: facts.leadTimeDays,
    note: "LEAD_TIME_FROM_TRUSTED_SUPPLIER_FACTS",
  };
}

function assertNullableNonNegativeInteger(
  value: number | null,
  field: string,
):
  | { ok: true; value: number | null }
  | { ok: false; detail: string } {
  if (value === null) {
    return { ok: true, value: null };
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return {
      ok: false,
      detail: `${field} must be a non-negative integer or null.`,
    };
  }
  return { ok: true, value };
}

function assertNullableNonNegativeFinite(
  value: number | null,
  field: string,
):
  | { ok: true; value: number | null }
  | { ok: false; detail: string } {
  if (value === null) {
    return { ok: true, value: null };
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return {
      ok: false,
      detail: `${field} must be a non-negative finite number or null.`,
    };
  }
  return { ok: true, value };
}
