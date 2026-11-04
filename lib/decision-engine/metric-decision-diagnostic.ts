/**
 * M7-PB1.b — offline diagnostic decision evaluation.
 *
 * Accepts only WeakSet-minted PB1.a binding successes. Reuses
 * decideInventoryAction + buildInventoryActionEvidence without forking rules.
 * Never production create, persist, merchant approval, UI, or forecast invention.
 *
 * Authority: docs/M7_PB1_TRUSTED_METRIC_DECISION_BINDING_CONTRACT.md §12.2 / §13 PB1.b
 */

import type { InventoryActionEvidence } from "@/lib/commerce-domain/types";

import {
  decideInventoryAction,
  INVENTORY_DECISION_VERSION_V1,
} from "./decide";

import {
  buildInventoryActionEvidence,
} from "./evidence-snapshot";

import {
  bindMetricToDecisionInput,
  isPb1TrustedMetricBindingSuccess,
  M7_PB1_METRIC_DECISION_BINDING_VERSION_V1,
  type Pb1HardFalseProvenance,
  type Pb1MappingNoteCode,
  type Pb1MetricDecisionBindingRejection,
  type Pb1MetricDecisionBindingRequest,
  type Pb1MetricDecisionBindingSuccess,
  type Pb1ProductionCreateGate,
} from "./metric-decision-binding";

import {
  buildDecisionReproducibilityFingerprint,
  DECISION_ALGORITHM_VERSIONS_V1,
} from "./reproducibility";

import type {
  InventoryDecisionInput,
  InventoryDecisionResult,
} from "./types";

export const M7_PB1_OFFLINE_DIAGNOSTIC_EVALUATION_VERSION_V1 =
  "m7-pb1-offline-diagnostic-decision-v1" as const;

export const M7_PB1_OFFLINE_DIAGNOSTIC_CONFIGURATION_VERSION_V1 =
  "m7-pb1-offline-diagnostic-config-v1" as const;

export interface Pb1OfflineDiagnosticDecisionSuccess {
  ok: true;
  bindingVersion: typeof M7_PB1_METRIC_DECISION_BINDING_VERSION_V1;
  diagnosticEvaluationVersion: typeof M7_PB1_OFFLINE_DIAGNOSTIC_EVALUATION_VERSION_V1;
  decisionAlgorithmVersion: typeof INVENTORY_DECISION_VERSION_V1;
  grain: Pb1MetricDecisionBindingSuccess["grain"];
  metricDate: string;
  metricAlgorithmVersion: Pb1MetricDecisionBindingSuccess["metricAlgorithmVersion"];
  pinnedTimeZone: string;
  metricSourceWatermark: string;
  decisionInput: InventoryDecisionInput;
  mappingNotes: readonly Pb1MappingNoteCode[];
  diagnosticDecision: InventoryDecisionResult;
  diagnosticEvidence: InventoryActionEvidence;
  reproducibilityFingerprint: string;
  provenance: Pb1HardFalseProvenance;
  warnings: Pb1MetricDecisionBindingSuccess["warnings"];
  productionCreateBlockedUntil: readonly Pb1ProductionCreateGate[];
}

export type Pb1OfflineDiagnosticDecisionResult =
  | Pb1MetricDecisionBindingRejection
  | Pb1OfflineDiagnosticDecisionSuccess;

/**
 * Explicit PB1.b entry point.
 *
 * Accepts only a successfully validated (WeakSet-minted) PB1.a result.
 * Arbitrary InventoryDecisionInput / forged success objects fail closed.
 */
export function evaluatePb1OfflineDiagnosticDecision(
  trustedBindingSuccess: unknown,
): Pb1OfflineDiagnosticDecisionResult {
  const gated = gateTrustedBindingSuccess(trustedBindingSuccess);
  if (!gated.ok) {
    return gated;
  }

  return runDiagnosticOnTrustedSuccess(gated.value);
}

/**
 * Convenience path for contract `runDiagnosticDecision=true`.
 *
 * Still runs PB1.a validation first; never accepts caller-supplied
 * InventoryDecisionInput as a bypass.
 */
export function evaluatePb1OfflineDiagnosticFromBindingRequest(
  request: Pb1MetricDecisionBindingRequest,
): Pb1OfflineDiagnosticDecisionResult {
  if (request === null || typeof request !== "object") {
    return rejectDiagnostic(
      "BINDING_ATTESTATION_INVALID",
      "PB1 binding request is required for offline diagnostic evaluation.",
    );
  }

  if (request.runDiagnosticDecision !== true) {
    return rejectDiagnostic(
      "BINDING_ATTESTATION_INVALID",
      "runDiagnosticDecision must be true for offline diagnostic evaluation.",
    );
  }

  // Reject direct decision-input bypass attempts on the request surface.
  if (
    (request as { decisionInput?: unknown }).decisionInput !== undefined
  ) {
    return rejectDiagnostic(
      "BINDING_ATTESTATION_INVALID",
      "PB1.b rejects caller-supplied decisionInput; use validated PB1.a mapping only.",
    );
  }

  const binding = bindMetricToDecisionInput(request);
  if (!binding.ok) {
    return binding;
  }

  return evaluatePb1OfflineDiagnosticDecision(binding);
}

function runDiagnosticOnTrustedSuccess(
  binding: Pb1MetricDecisionBindingSuccess,
): Pb1OfflineDiagnosticDecisionSuccess {
  const decisionInput = Object.freeze(
    cloneDecisionInput(binding.decisionInput),
  );
  const diagnosticDecision = freezeDiagnosticDecision(
    decideInventoryAction(decisionInput),
  );
  const diagnosticEvidence = freezeDiagnosticEvidence(
    buildInventoryActionEvidence({
      decisionInput,
      reasonCodes: diagnosticDecision.reasonCodes,
    }),
  );

  const configurationVersion =
    M7_PB1_OFFLINE_DIAGNOSTIC_CONFIGURATION_VERSION_V1;

  const reproducibility = buildDecisionReproducibilityFingerprint(
    {
      algorithmVersions: DECISION_ALGORITHM_VERSIONS_V1,
      configurationVersion,
    },
    {
      grain: {
        organizationId: binding.grain.organizationId,
        storeId: binding.grain.storeId,
        locationId: binding.grain.locationId,
        variantId: binding.grain.variantId,
      },
      forecastEligibility: "ineligible",
      decisionInput,
      decision: diagnosticDecision,
      metricSourceWatermark: binding.metricSourceWatermark,
      diagnosticEvaluationVersion:
        M7_PB1_OFFLINE_DIAGNOSTIC_EVALUATION_VERSION_V1,
    },
  );

  const mappingNotes = Object.freeze([
    ...binding.mappingNotes,
    "DIAGNOSTIC_DECISION_RUN" as const,
  ]);

  return Object.freeze({
    ok: true as const,
    bindingVersion: M7_PB1_METRIC_DECISION_BINDING_VERSION_V1,
    diagnosticEvaluationVersion:
      M7_PB1_OFFLINE_DIAGNOSTIC_EVALUATION_VERSION_V1,
    decisionAlgorithmVersion: INVENTORY_DECISION_VERSION_V1,
    grain: Object.freeze({
      organizationId: binding.grain.organizationId,
      storeId: binding.grain.storeId,
      locationId: binding.grain.locationId,
      variantId: binding.grain.variantId,
    }),
    metricDate: binding.metricDate,
    metricAlgorithmVersion: binding.metricAlgorithmVersion,
    pinnedTimeZone: binding.pinnedTimeZone,
    metricSourceWatermark: binding.metricSourceWatermark,
    decisionInput,
    mappingNotes,
    diagnosticDecision,
    diagnosticEvidence,
    reproducibilityFingerprint: reproducibility.fingerprint,
    provenance: Object.freeze({ ...binding.provenance }),
    warnings: binding.warnings,
    productionCreateBlockedUntil: binding.productionCreateBlockedUntil,
  });
}

function freezeDiagnosticDecision(
  decision: InventoryDecisionResult,
): InventoryDecisionResult {
  return Object.freeze({
    algorithmVersion: decision.algorithmVersion,
    healthState: decision.healthState,
    actionType: decision.actionType,
    compatibleSecondaryActionTypes: Object.freeze([
      ...decision.compatibleSecondaryActionTypes,
    ]),
    priority: decision.priority,
    recommendedQuantity: decision.recommendedQuantity,
    confidence: decision.confidence,
    reasonCodes: Object.freeze([...decision.reasonCodes]),
  });
}

function freezeDiagnosticEvidence(
  evidence: InventoryActionEvidence,
): InventoryActionEvidence {
  // Runtime-immutable; cast preserves InventoryActionEvidence.reasonCodes: string[].
  return Object.freeze({
    availableQuantity: evidence.availableQuantity,
    incomingQuantity: evidence.incomingQuantity,
    demandVelocity: evidence.demandVelocity,
    daysOfStock: evidence.daysOfStock,
    leadTimeDays: evidence.leadTimeDays,
    safetyStockUnits: evidence.safetyStockUnits,
    reorderPointUnits: evidence.reorderPointUnits,
    targetStockUnits: evidence.targetStockUnits,
    inventoryAgeDays: evidence.inventoryAgeDays,
    forecastExpectedDemandUnits: evidence.forecastExpectedDemandUnits,
    dataQualityScore: evidence.dataQualityScore,
    reasonCodes: Object.freeze([...evidence.reasonCodes]) as string[],
  });
}

function gateTrustedBindingSuccess(
  value: unknown,
):
  | { ok: true; value: Pb1MetricDecisionBindingSuccess }
  | Pb1MetricDecisionBindingRejection {
  if (value === null || typeof value !== "object") {
    return rejectDiagnostic(
      "BINDING_ATTESTATION_INVALID",
      "PB1.b requires a WeakSet-minted PB1.a binding success.",
    );
  }

  // Explicit reject of raw engine inputs / foreign envelopes.
  if (
    !("ok" in value) &&
    ("availableQuantity" in value || "forecastExpectedDemandUnits" in value)
  ) {
    return rejectDiagnostic(
      "BINDING_ATTESTATION_INVALID",
      "PB1.b rejects arbitrary InventoryDecisionInput; PB1.a validation is required.",
    );
  }

  if (!isPb1TrustedMetricBindingSuccess(value)) {
    return rejectDiagnostic(
      "BINDING_ATTESTATION_INVALID",
      "PB1.b rejects forged or unminted binding results.",
    );
  }

  if (value.bindingVersion !== M7_PB1_METRIC_DECISION_BINDING_VERSION_V1) {
    return rejectDiagnostic(
      "BINDING_ATTESTATION_INVALID",
      "bindingVersion must be m7-pb1-metric-decision-binding-v1.",
    );
  }

  const provenance = value.provenance;
  if (
    provenance === null ||
    typeof provenance !== "object" ||
    provenance.forecastEligibility !== "ineligible" ||
    provenance.isScoredMerchantDecision !== false ||
    provenance.claimsMerchantFacing !== false ||
    provenance.claimsProductionForecastApproval !== false ||
    provenance.claimsM7ProductionEligibility !== false ||
    provenance.algorithmApproved !== false ||
    provenance.productionDecisionCreationEligible !== false ||
    provenance.productionApprovalEligible !== false ||
    provenance.notProductionActivation !== true ||
    provenance.engineBoundBriefEligible !== false ||
    provenance.evidenceScope !== "m5_metric_bound_preparation_only"
  ) {
    return rejectDiagnostic(
      "PRODUCTION_TRUST_CLAIM_REJECTED",
      "PB1.b rejects binding results that claim production or merchant eligibility.",
    );
  }

  const decisionInput = value.decisionInput;
  if (decisionInput === null || typeof decisionInput !== "object") {
    return rejectDiagnostic(
      "METRIC_ROW_INVARIANT_VIOLATION",
      "trusted binding success is missing decisionInput.",
    );
  }

  if (decisionInput.forecastExpectedDemandUnits !== null) {
    return rejectDiagnostic(
      "FORECAST_ELIGIBILITY_INVALID",
      "PB1.b diagnostic requires forecastExpectedDemandUnits=null (ineligible).",
    );
  }

  if (decisionInput.forecastConfidence !== "low") {
    return rejectDiagnostic(
      "FORECAST_ELIGIBILITY_INVALID",
      'PB1.b diagnostic requires forecastConfidence="low" when forecast is ineligible.',
    );
  }

  if (
    !decisionInput.incomingStateKnown &&
    decisionInput.validIncomingQuantity !== null
  ) {
    return rejectDiagnostic(
      "INCOMING_STATE_CONTRADICTION",
      "incomingStateKnown=false cannot carry a numeric validIncomingQuantity.",
    );
  }

  const grain = value.grain;
  if (
    grain === null ||
    typeof grain !== "object" ||
    typeof grain.organizationId !== "string" ||
    grain.organizationId.trim().length === 0 ||
    typeof grain.storeId !== "string" ||
    grain.storeId.trim().length === 0 ||
    typeof grain.locationId !== "string" ||
    grain.locationId.trim().length === 0 ||
    typeof grain.variantId !== "string" ||
    grain.variantId.trim().length === 0
  ) {
    return rejectDiagnostic(
      "GRAIN_MISMATCH",
      "trusted binding success grain identity is malformed.",
    );
  }

  return { ok: true, value };
}

function rejectDiagnostic(
  code: Pb1MetricDecisionBindingRejection["code"],
  detail: string,
): Pb1MetricDecisionBindingRejection {
  return Object.freeze({
    ok: false as const,
    bindingVersion: M7_PB1_METRIC_DECISION_BINDING_VERSION_V1,
    code,
    detail,
    provenance: Object.freeze({
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
    }),
  });
}

function cloneDecisionInput(
  input: InventoryDecisionInput,
): InventoryDecisionInput {
  return {
    availableQuantity: input.availableQuantity,
    validIncomingQuantity: input.validIncomingQuantity,
    incomingStateKnown: input.incomingStateKnown,
    demandVelocity: input.demandVelocity,
    daysOfStock: input.daysOfStock,
    leadTimeDays: input.leadTimeDays,
    safetyStockUnits: input.safetyStockUnits,
    reorderPointUnits: input.reorderPointUnits,
    targetStockUnits: input.targetStockUnits,
    recommendedOrderQuantity: input.recommendedOrderQuantity,
    inventoryAgeDays: input.inventoryAgeDays,
    demandTrend: input.demandTrend,
    stockoutRisk: input.stockoutRisk,
    overstockRisk: input.overstockRisk,
    forecastExpectedDemandUnits: input.forecastExpectedDemandUnits,
    forecastConfidence: input.forecastConfidence,
    dataQualityScore: input.dataQualityScore,
  };
}
