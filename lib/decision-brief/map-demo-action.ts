/**
 * Pure DemoActionItem → DecisionBriefGroundingInput mapper.
 *
 * Never invents freshness, timestamps, or quantities.
 * Demo reason-code namespace stays snake_case (not engine SCREAMING).
 *
 * Trust/attestation is NOT granted by default. Only an explicit
 * trustedDemoAttestation from a verified attested fixture path
 * (composeDemoDecisionBrief) may stamp synthetic demo provenance.
 */

import {
  demoActionShowsRecommendedQuantity,
  M7_DEMO_ATTESTATION,
  type DemoActionItem,
} from "@/lib/demo/m7-decision-demo-fixtures";

import {
  known,
  notApplicable,
  numberFieldFromNullable,
  stringFieldFromNullable,
  unknown,
} from "@/lib/decision-brief/fields";

import {
  DECISION_BRIEF_DEMO_ATTESTATION,
  DECISION_BRIEF_SCHEMA_VERSION,
  type DecisionBriefDemoAttestation,
  type DecisionBriefGroundingInput,
  type DecisionBriefTrustClaims,
} from "@/lib/decision-brief/types";

import {
  defaultNextStepSummary,
} from "@/lib/decision-brief/next-step";

export type MapDemoActionToGroundingOptions = {
  organizationId?: string | null;
  storeId?: string | null;
  locationId?: string | null;
  variantId?: string | null;
  /**
   * Only set after the caller has verified the action against an
   * attested demo fixture root. Arbitrary caller-supplied actions
   * must omit this — the mapper will not invent trust.
   */
  trustedDemoAttestation?: DecisionBriefDemoAttestation;
};

function mapRecommendedQuantity(
  action: DemoActionItem,
): DecisionBriefGroundingInput["recommendedQuantity"] {
  if (
    action.actionType !== "REORDER"
  ) {
    return notApplicable(
      "quantity_not_applicable_for_action_type",
    );
  }

  if (
    demoActionShowsRecommendedQuantity(action)
  ) {
    return known(
      action.recommendedQuantity as number,
    );
  }

  return unknown(
    "recommended_quantity_unknown",
  );
}

function untrustedDemoTrustClaims(): DecisionBriefTrustClaims {
  return {
    claimsMerchantFacing: false,
    claimsM7ProductionEligibility: false,
    algorithmApproved: false,
    isScoredMerchantDecision: false,
    claimsProductionForecastApproval: false,
    evidenceScope: "unknown",
  };
}

function trustedSyntheticDemoTrustClaims(): DecisionBriefTrustClaims {
  return {
    claimsMerchantFacing: false,
    claimsM7ProductionEligibility: false,
    algorithmApproved: false,
    isScoredMerchantDecision: false,
    claimsProductionForecastApproval: false,
    evidenceScope: "synthetic_demonstration",
  };
}

/**
 * Maps a synthetic demo action into brief grounding.
 * Freshness / as-of / observation timestamps remain unknown unless
 * fixtures later supply explicit synthetic stamps (U1 default).
 *
 * Without trustedDemoAttestation, grounding remains unattested and
 * must not pass synthetic_demo validation / composition.
 */
export function mapDemoActionToGrounding(
  action: DemoActionItem,
  options: MapDemoActionToGroundingOptions = {},
): DecisionBriefGroundingInput {
  const nextStepSummary =
    defaultNextStepSummary(
      action.actionType,
    );

  const trustedAttestation =
    options.trustedDemoAttestation ===
      DECISION_BRIEF_DEMO_ATTESTATION ||
    options.trustedDemoAttestation ===
      M7_DEMO_ATTESTATION
      ? DECISION_BRIEF_DEMO_ATTESTATION
      : undefined;

  const grounding: DecisionBriefGroundingInput = {
    schemaVersion: DECISION_BRIEF_SCHEMA_VERSION,
    briefMode: "synthetic_demo",

    organizationId:
      options.organizationId ?? null,
    storeId:
      options.storeId ?? null,
    locationId:
      options.locationId ?? null,
    variantId:
      options.variantId ?? null,
    productTitle: action.productTitle,
    variantTitle: action.variantTitle,

    actionType: action.actionType,
    priority: action.priority,
    confidence: action.confidence,
    recommendedQuantity:
      mapRecommendedQuantity(action),
    recommendedActionDate:
      stringFieldFromNullable(
        action.recommendedActionDate,
        "recommended_action_date_unknown",
      ),

    // Preserve demo snake_case reason-code namespace (U4).
    reasonCodes: [
      ...action.evidence.reasonCodes,
    ],
    confidenceReasonCodes: [
      ...action.confidenceReasonCodes,
    ],

    evidence: {
      availableQuantity:
        numberFieldFromNullable(
          action.evidence.availableQuantity,
          "available_quantity_unknown",
        ),
      incomingQuantity:
        numberFieldFromNullable(
          action.evidence.incomingQuantity,
          "incoming_quantity_unknown",
        ),
      demandVelocity:
        numberFieldFromNullable(
          action.evidence.demandVelocity,
          "demand_velocity_unknown",
        ),
      daysOfStock:
        numberFieldFromNullable(
          action.evidence.daysOfStock,
          "days_of_stock_unknown",
        ),
      leadTimeDays:
        numberFieldFromNullable(
          action.evidence.leadTimeDays,
          "lead_time_days_unknown",
        ),
      safetyStockUnits:
        numberFieldFromNullable(
          action.evidence.safetyStockUnits,
          "safety_stock_units_unknown",
        ),
      reorderPointUnits:
        numberFieldFromNullable(
          action.evidence.reorderPointUnits,
          "reorder_point_units_unknown",
        ),
      targetStockUnits:
        numberFieldFromNullable(
          action.evidence.targetStockUnits,
          "target_stock_units_unknown",
        ),
      inventoryAgeDays:
        numberFieldFromNullable(
          action.evidence.inventoryAgeDays,
          "inventory_age_days_unknown",
        ),
      forecastExpectedDemandUnits:
        numberFieldFromNullable(
          action.evidence.forecastExpectedDemandUnits,
          "forecast_expected_demand_unknown",
        ),
      dataQualityScore:
        numberFieldFromNullable(
          action.evidence.dataQualityScore,
          "data_quality_score_unknown",
        ),
    },

    decisionAsOf: unknown(
      "decision_as_of_unknown",
    ),
    pinnedTimeZone: unknown(
      "pinned_time_zone_unknown",
    ),
    evidenceSourceTimestamps: {
      inventoryObservationAt: unknown(
        "inventory_observation_at_unknown",
      ),
      metricsComputedAt: unknown(
        "metrics_computed_at_unknown",
      ),
      forecastAsOf: unknown(
        "forecast_as_of_unknown",
      ),
    },
    freshness: {
      status: "unknown",
      staleReasonCodes: [],
    },

    trustClaims: trustedAttestation
      ? trustedSyntheticDemoTrustClaims()
      : untrustedDemoTrustClaims(),

    deterministicFallbackCopy: {
      // U8: reuse conciseReason verbatim as fallback why-now.
      whyNow: action.conciseReason,
      suggestedNextStep: nextStepSummary,
    },
  };

  if (
    trustedAttestation
  ) {
    grounding.demoAttestation =
      trustedAttestation;
  }

  return grounding;
}

/**
 * Fail-closed attestation gate matching fixture loader semantics.
 * Callers must not render a brief when this returns false.
 */
export function demoAttestationIsValid(
  attestation: string | undefined | null,
): boolean {
  return (
    attestation === M7_DEMO_ATTESTATION ||
    attestation === DECISION_BRIEF_DEMO_ATTESTATION
  );
}

/**
 * Decision-critical fields that must match the attested fixture row
 * before compose may stamp trust onto a caller-supplied action.
 */
export function demoActionMatchesTrustedFixture(
  candidate: DemoActionItem,
  trusted: DemoActionItem,
): boolean {
  return (
    candidate.id === trusted.id &&
    candidate.actionType === trusted.actionType &&
    candidate.priority === trusted.priority &&
    candidate.confidence === trusted.confidence &&
    candidate.productTitle === trusted.productTitle &&
    candidate.variantTitle === trusted.variantTitle &&
    candidate.conciseReason === trusted.conciseReason &&
    candidate.recommendedQuantity ===
      trusted.recommendedQuantity &&
    candidate.recommendedActionDate ===
      trusted.recommendedActionDate &&
    JSON.stringify(candidate.confidenceReasonCodes) ===
      JSON.stringify(trusted.confidenceReasonCodes) &&
    JSON.stringify(candidate.evidence) ===
      JSON.stringify(trusted.evidence)
  );
}
