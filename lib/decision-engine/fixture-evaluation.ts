import type {
  ConfidenceLevel,
  InventoryActionEvidence,
  UnitQuantity,
} from "@/lib/commerce-domain/types";

import {
  applySupplierOrderConstraints,
  calculateRecommendedOrderQuantity,
} from "@/lib/metrics/inventory-math";

import type {
  DemandTrend,
  InventoryRiskLevel,
} from "@/lib/metrics/types";

import {
  decideInventoryAction,
  INVENTORY_DECISION_VERSION_V1,
} from "./decide";

import {
  buildInventoryActionEvidence,
} from "./evidence-snapshot";

import {
  buildDecisionReproducibilityFingerprint,
  DECISION_ALGORITHM_VERSIONS_V1,
} from "./reproducibility";

import type {
  InventoryDecisionInput,
  InventoryDecisionResult,
} from "./types";

/**
 * M7.1 — pure TypeScript fixture-only decision evaluation.
 *
 * Wraps inventory-decision-v1. Does not recalculate decision rules,
 * publish forecasts, persist actions, or claim merchant/production truth.
 */

export const M7_FIXTURE_DECISION_EVALUATION_VERSION_V1 =
  "m7-fixture-decision-evaluation-v1" as const;

export const M7_FIXTURE_DECISION_CONFIGURATION_VERSION_V1 =
  "m7-fixture-decision-config-v1" as const;

/**
 * Developer declaration that this evaluation is a controlled local fixture.
 *
 * This is NOT cryptographic proof, NOT a production authorization mechanism,
 * and does NOT authenticate merchant/live forecast provenance. Callers outside
 * local tests/fixtures must not invoke this API.
 */
export const M7_CONTROLLED_LOCAL_FIXTURE_ATTESTATION_V1 =
  "m7-controlled-local-fixture-v1" as const;

export type M7FixtureForecastEligibility =
  | "ineligible"
  | "fixture_synthetic";

export interface M7DecisionGrain {
  organizationId: string;
  storeId: string;
  locationId: string;
  variantId: string;
}

export interface M7FixtureSupplierConstraints {
  minimumOrderQuantity: number | null;
  packSize: number | null;
}

export interface M7FixtureDecisionEvaluationRequest {
  grain: M7DecisionGrain;
  evidenceScope: "controlled_fixture_only";
  /**
   * Must equal M7_CONTROLLED_LOCAL_FIXTURE_ATTESTATION_V1.
   * Developer declaration only — not crypto proof or production authz.
   */
  fixtureAttestation: typeof M7_CONTROLLED_LOCAL_FIXTURE_ATTESTATION_V1;
  forecastEligibility: M7FixtureForecastEligibility;
  claimsMerchantFacing: false;
  claimsProductionForecastApproval: false;
  claimsM7ProductionEligibility: false;
  algorithmApproved: false;
  decisionInput: InventoryDecisionInput;
  /**
   * When true, derive ROQ via calculateRecommendedOrderQuantity from the
   * fixture's target/available/incoming fields before deciding.
   */
  deriveRecommendedOrderQuantity?: boolean;
  /**
   * Optional MOQ/pack applied via applySupplierOrderConstraints to a
   * non-null ROQ (derived or provided). Never invents ROQ from forecast.
   */
  supplierConstraints?: M7FixtureSupplierConstraints | null;
  configurationVersion?: string;
}

export interface M7FixtureDecisionEvaluationResult {
  evaluationVersion: typeof M7_FIXTURE_DECISION_EVALUATION_VERSION_V1;
  audience: "local_developer";
  evidenceScope: "controlled_fixture_only";
  grain: M7DecisionGrain;
  forecastEligibility: M7FixtureForecastEligibility;
  decisionAlgorithmVersion: typeof INVENTORY_DECISION_VERSION_V1;
  decision: InventoryDecisionResult;
  evidence: InventoryActionEvidence;
  decisionInputUsed: InventoryDecisionInput;
  reproducibilityFingerprint: string;
  provenance: {
    isScoredMerchantDecision: false;
    claimsMerchantFacing: false;
    claimsProductionForecastApproval: false;
    claimsM7ProductionEligibility: false;
    algorithmApproved: false;
    notProductionActivation: true;
    controlledFixtureOnly: true;
  };
  warnings: readonly [
    "controlled_fixture_only",
    "NOT_merchant_facing",
    "NOT_production_activation",
    "NOT_production_forecast",
  ];
}

export class M7FixtureDecisionEvaluationError extends Error {
  readonly code = "M7_FIXTURE_DECISION_EVALUATION";

  constructor(message: string) {
    super(message);
    this.name = "M7FixtureDecisionEvaluationError";
  }
}

const CONFIDENCE_LEVELS: ReadonlySet<ConfidenceLevel> = new Set([
  "high",
  "medium",
  "low",
]);

const DEMAND_TRENDS: ReadonlySet<DemandTrend> = new Set([
  "rising",
  "stable",
  "falling",
]);

const RISK_LEVELS: ReadonlySet<InventoryRiskLevel> = new Set([
  "high",
  "medium",
  "low",
]);

const WARNINGS = [
  "controlled_fixture_only",
  "NOT_merchant_facing",
  "NOT_production_activation",
  "NOT_production_forecast",
] as const;

/**
 * Evaluate a controlled fixture through the existing deterministic
 * inventory decision engine. Local-developer only.
 */
export function evaluateFixtureInventoryDecision(
  request: M7FixtureDecisionEvaluationRequest,
): M7FixtureDecisionEvaluationResult {
  assertRequest(request);

  const grain = cloneGrain(request.grain);
  const configurationVersion =
    request.configurationVersion?.trim() ||
    M7_FIXTURE_DECISION_CONFIGURATION_VERSION_V1;

  let decisionInput = cloneDecisionInput(request.decisionInput);

  if (request.forecastEligibility === "ineligible") {
    if (decisionInput.forecastExpectedDemandUnits !== null) {
      throw new M7FixtureDecisionEvaluationError(
        "forecast-ineligible fixtures must not supply forecastExpectedDemandUnits.",
      );
    }
  } else if (decisionInput.forecastExpectedDemandUnits === null) {
    throw new M7FixtureDecisionEvaluationError(
      "fixture_synthetic forecastEligibility requires forecastExpectedDemandUnits.",
    );
  }

  if (request.deriveRecommendedOrderQuantity === true) {
    decisionInput = {
      ...decisionInput,
      recommendedOrderQuantity: deriveOrderQuantity(decisionInput),
    };
  }

  if (request.supplierConstraints !== undefined && request.supplierConstraints !== null) {
    decisionInput = {
      ...decisionInput,
      recommendedOrderQuantity: applyConstraintsToQuantity(
        decisionInput.recommendedOrderQuantity,
        request.supplierConstraints,
      ),
    };
  }

  assertDecisionInput(decisionInput);

  const decision = decideInventoryAction(decisionInput);
  const evidence = buildInventoryActionEvidence({
    decisionInput,
    reasonCodes: decision.reasonCodes,
  });

  const reproducibility = buildDecisionReproducibilityFingerprint(
    {
      algorithmVersions: DECISION_ALGORITHM_VERSIONS_V1,
      configurationVersion,
    },
    {
      grain,
      forecastEligibility: request.forecastEligibility,
      decisionInput,
      decision,
    },
  );

  return {
    evaluationVersion: M7_FIXTURE_DECISION_EVALUATION_VERSION_V1,
    audience: "local_developer",
    evidenceScope: "controlled_fixture_only",
    grain,
    forecastEligibility: request.forecastEligibility,
    decisionAlgorithmVersion: INVENTORY_DECISION_VERSION_V1,
    decision,
    evidence,
    decisionInputUsed: decisionInput,
    reproducibilityFingerprint: reproducibility.fingerprint,
    provenance: {
      isScoredMerchantDecision: false,
      claimsMerchantFacing: false,
      claimsProductionForecastApproval: false,
      claimsM7ProductionEligibility: false,
      algorithmApproved: false,
      notProductionActivation: true,
      controlledFixtureOnly: true,
    },
    warnings: WARNINGS,
  };
}

function deriveOrderQuantity(
  input: InventoryDecisionInput,
): UnitQuantity | null {
  const result = calculateRecommendedOrderQuantity({
    targetStockUnits: input.targetStockUnits,
    availableQuantity: input.availableQuantity,
    validIncomingQuantity: input.validIncomingQuantity,
    incomingStateKnown: input.incomingStateKnown,
  });

  return result.value;
}

function applyConstraintsToQuantity(
  quantity: UnitQuantity | null,
  constraints: M7FixtureSupplierConstraints,
): UnitQuantity | null {
  if (quantity === null) {
    return null;
  }

  assertNonNegativeInteger(quantity, "recommendedOrderQuantity");

  const constrained = applySupplierOrderConstraints({
    requiredQuantity: quantity,
    minimumOrderQuantity: constraints.minimumOrderQuantity,
    packSize: constraints.packSize,
  });

  return constrained.constrainedQuantity;
}

function assertRequest(
  request: M7FixtureDecisionEvaluationRequest,
): void {
  if (request === null || typeof request !== "object") {
    throw new M7FixtureDecisionEvaluationError(
      "fixture decision request is required.",
    );
  }

  if (request.evidenceScope !== "controlled_fixture_only") {
    throw new M7FixtureDecisionEvaluationError(
      "evidenceScope must be controlled_fixture_only.",
    );
  }

  if (
    request.fixtureAttestation !== M7_CONTROLLED_LOCAL_FIXTURE_ATTESTATION_V1
  ) {
    throw new M7FixtureDecisionEvaluationError(
      "fixtureAttestation must be m7-controlled-local-fixture-v1 (developer declaration only; not production authorization).",
    );
  }

  if (
    request.forecastEligibility !== "ineligible" &&
    request.forecastEligibility !== "fixture_synthetic"
  ) {
    throw new M7FixtureDecisionEvaluationError(
      "forecastEligibility must be ineligible or fixture_synthetic.",
    );
  }

  if (
    request.claimsMerchantFacing !== false ||
    request.claimsProductionForecastApproval !== false ||
    request.claimsM7ProductionEligibility !== false ||
    request.algorithmApproved !== false
  ) {
    throw new M7FixtureDecisionEvaluationError(
      "fixture evaluation rejects merchant/production/algorithm approval claims.",
    );
  }

  assertGrain(request.grain);

  if (
    request.decisionInput === null ||
    typeof request.decisionInput !== "object"
  ) {
    throw new M7FixtureDecisionEvaluationError(
      "decisionInput is required.",
    );
  }

  if (
    request.supplierConstraints !== undefined &&
    request.supplierConstraints !== null
  ) {
    assertSupplierConstraints(request.supplierConstraints);
  }
}

function assertGrain(grain: M7DecisionGrain): void {
  if (grain === null || typeof grain !== "object") {
    throw new M7FixtureDecisionEvaluationError("grain is required.");
  }

  assertIdentity(grain.organizationId, "grain.organizationId");
  assertIdentity(grain.storeId, "grain.storeId");
  assertIdentity(grain.locationId, "grain.locationId");
  assertIdentity(grain.variantId, "grain.variantId");
}

function assertIdentity(value: string, field: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new M7FixtureDecisionEvaluationError(`${field} is required.`);
  }
}

function assertSupplierConstraints(
  constraints: M7FixtureSupplierConstraints,
): void {
  if (
    constraints.minimumOrderQuantity !== null &&
    (!Number.isInteger(constraints.minimumOrderQuantity) ||
      constraints.minimumOrderQuantity <= 0)
  ) {
    throw new M7FixtureDecisionEvaluationError(
      "minimumOrderQuantity must be a positive integer or null.",
    );
  }

  if (
    constraints.packSize !== null &&
    (!Number.isInteger(constraints.packSize) || constraints.packSize <= 0)
  ) {
    throw new M7FixtureDecisionEvaluationError(
      "packSize must be a positive integer or null.",
    );
  }
}

function assertDecisionInput(input: InventoryDecisionInput): void {
  assertNullableNonNegativeInteger(
    input.availableQuantity,
    "availableQuantity",
  );
  assertNullableNonNegativeInteger(
    input.validIncomingQuantity,
    "validIncomingQuantity",
  );

  if (typeof input.incomingStateKnown !== "boolean") {
    throw new M7FixtureDecisionEvaluationError(
      "incomingStateKnown must be a boolean.",
    );
  }

  if (
    !input.incomingStateKnown &&
    input.validIncomingQuantity !== null
  ) {
    throw new M7FixtureDecisionEvaluationError(
      "incomingStateKnown=false cannot carry a numeric validIncomingQuantity.",
    );
  }

  assertNullableNonNegativeFinite(input.demandVelocity, "demandVelocity");
  assertNullableNonNegativeFinite(input.daysOfStock, "daysOfStock");
  assertNullableNonNegativeFinite(input.leadTimeDays, "leadTimeDays");
  assertNullableNonNegativeFinite(
    input.safetyStockUnits,
    "safetyStockUnits",
  );
  assertNullableNonNegativeFinite(
    input.reorderPointUnits,
    "reorderPointUnits",
  );
  assertNullableNonNegativeFinite(
    input.targetStockUnits,
    "targetStockUnits",
  );
  assertNullableNonNegativeInteger(
    input.recommendedOrderQuantity,
    "recommendedOrderQuantity",
  );
  assertNullableNonNegativeInteger(
    input.inventoryAgeDays,
    "inventoryAgeDays",
  );
  assertNullableNonNegativeFinite(
    input.forecastExpectedDemandUnits,
    "forecastExpectedDemandUnits",
  );

  if (
    input.demandTrend !== null &&
    !DEMAND_TRENDS.has(input.demandTrend)
  ) {
    throw new M7FixtureDecisionEvaluationError(
      "demandTrend is not a recognized DemandTrend.",
    );
  }

  if (
    input.stockoutRisk !== null &&
    !RISK_LEVELS.has(input.stockoutRisk)
  ) {
    throw new M7FixtureDecisionEvaluationError(
      "stockoutRisk is not a recognized InventoryRiskLevel.",
    );
  }

  if (
    input.overstockRisk !== null &&
    !RISK_LEVELS.has(input.overstockRisk)
  ) {
    throw new M7FixtureDecisionEvaluationError(
      "overstockRisk is not a recognized InventoryRiskLevel.",
    );
  }

  if (!CONFIDENCE_LEVELS.has(input.forecastConfidence)) {
    throw new M7FixtureDecisionEvaluationError(
      "forecastConfidence must be high, medium, or low.",
    );
  }

  if (input.dataQualityScore !== null) {
    if (
      !Number.isFinite(input.dataQualityScore) ||
      input.dataQualityScore < 0 ||
      input.dataQualityScore > 100
    ) {
      throw new M7FixtureDecisionEvaluationError(
        "dataQualityScore must be between 0 and 100 when present.",
      );
    }
  }
}

function assertNullableNonNegativeInteger(
  value: number | null,
  field: string,
): void {
  if (value === null) {
    return;
  }
  assertNonNegativeInteger(value, field);
}

function assertNonNegativeInteger(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new M7FixtureDecisionEvaluationError(
      `${field} must be a non-negative integer.`,
    );
  }
}

function assertNullableNonNegativeFinite(
  value: number | null,
  field: string,
): void {
  if (value === null) {
    return;
  }
  if (!Number.isFinite(value) || value < 0) {
    throw new M7FixtureDecisionEvaluationError(
      `${field} must be a non-negative finite number.`,
    );
  }
}

function cloneGrain(grain: M7DecisionGrain): M7DecisionGrain {
  return {
    organizationId: grain.organizationId.trim(),
    storeId: grain.storeId.trim(),
    locationId: grain.locationId.trim(),
    variantId: grain.variantId.trim(),
  };
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
