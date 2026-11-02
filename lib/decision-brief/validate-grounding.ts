/**
 * Fail-closed grounding validation for decision-brief-v1.
 *
 * Unknown REORDER quantity is allowed.
 * Inconsistent false `known` quantity is rejected.
 */

import {
  isKnown,
} from "@/lib/decision-brief/fields";

import {
  DECISION_BRIEF_DEMO_ATTESTATION,
  DECISION_BRIEF_SCHEMA_VERSION,
  type DecisionBriefActionType,
  type DecisionBriefConfidence,
  type DecisionBriefGroundingInput,
  type DecisionBriefPriority,
  type DecisionBriefRejectionCode,
  type Field,
  type GroundingValidationResult,
} from "@/lib/decision-brief/types";

const ACTION_TYPES =
  new Set<DecisionBriefActionType>([
    "REORDER",
    "REDUCE",
    "PROMOTE",
    "WATCH",
  ]);

const PRIORITIES =
  new Set<DecisionBriefPriority>([
    "critical",
    "high",
    "medium",
    "low",
  ]);

const CONFIDENCE_LEVELS =
  new Set<DecisionBriefConfidence>([
    "high",
    "medium",
    "low",
  ]);

function pushUnique(
  reasons: DecisionBriefRejectionCode[],
  code: DecisionBriefRejectionCode,
): void {
  if (
    !reasons.includes(code)
  ) {
    reasons.push(code);
  }
}

function isPositiveInteger(
  value: number,
): boolean {
  return (
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value > 0
  );
}

function validateQuantityGrounding(
  grounding: DecisionBriefGroundingInput,
  reasons: DecisionBriefRejectionCode[],
): void {
  const quantity =
    grounding.recommendedQuantity;

  if (
    grounding.actionType === "REORDER"
  ) {
    if (
      quantity.state === "not_applicable"
    ) {
      pushUnique(
        reasons,
        "QUANTITY_GROUNDING_INCONSISTENT",
      );
      return;
    }

    if (
      quantity.state === "unknown"
    ) {
      // Allowed — display Unknown; never invent; not editable.
      return;
    }

    if (
      !isPositiveInteger(quantity.value)
    ) {
      pushUnique(
        reasons,
        "QUANTITY_GROUNDING_INCONSISTENT",
      );
    }

    return;
  }

  if (
    quantity.state !== "not_applicable"
  ) {
    pushUnique(
      reasons,
      "QUANTITY_GROUNDING_INCONSISTENT",
    );
  }
}

function validateEvidenceFields(
  grounding: DecisionBriefGroundingInput,
  reasons: DecisionBriefRejectionCode[],
): void {
  const evidence =
    grounding.evidence;

  for (
    const [key, field] of Object.entries(
      evidence,
    ) as Array<
      [
        keyof DecisionBriefGroundingInput["evidence"],
        Field<number>,
      ]
    >
  ) {
    if (
      field.state !== "known"
    ) {
      continue;
    }

    if (
      !Number.isFinite(field.value)
    ) {
      pushUnique(
        reasons,
        "GROUNDING_INCOMPLETE",
      );
      continue;
    }

    if (
      key === "dataQualityScore" &&
      (
        field.value < 0 ||
        field.value > 1
      )
    ) {
      pushUnique(
        reasons,
        "GROUNDING_INCOMPLETE",
      );
    }
  }
}

function validateTrustAndAttestation(
  grounding: DecisionBriefGroundingInput,
  reasons: DecisionBriefRejectionCode[],
): void {
  // E1: engine_bound types are preserved on the schema but composition
  // remains fail-closed until separately authorized E4 grounding.
  if (
    grounding.briefMode === "engine_bound"
  ) {
    pushUnique(
      reasons,
      "INVALID_BRIEF_MODE",
    );
    return;
  }

  if (
    grounding.briefMode === "synthetic_demo"
  ) {
    if (
      grounding.demoAttestation !==
      DECISION_BRIEF_DEMO_ATTESTATION
    ) {
      pushUnique(
        reasons,
        "MISSING_ATTESTATION",
      );
    }

    const trust =
      grounding.trustClaims;

    if (
      trust.claimsMerchantFacing ||
      trust.claimsM7ProductionEligibility ||
      trust.algorithmApproved ||
      trust.isScoredMerchantDecision ||
      trust.claimsProductionForecastApproval
    ) {
      pushUnique(
        reasons,
        "TRUST_CLAIMS_INVALID",
      );
    }

    if (
      trust.evidenceScope !==
        "synthetic_demonstration" &&
      trust.evidenceScope !==
        "controlled_fixture_only"
    ) {
      pushUnique(
        reasons,
        "TRUST_CLAIMS_INVALID",
      );
    }

    return;
  }

  pushUnique(
    reasons,
    "INVALID_BRIEF_MODE",
  );
}

/**
 * Fail-closed schema / attestation / trust / quantity / reason-code validation.
 */
export function validateGrounding(
  grounding: DecisionBriefGroundingInput,
): GroundingValidationResult {
  const reasons:
    DecisionBriefRejectionCode[] =
      [];

  if (
    grounding.schemaVersion !==
    DECISION_BRIEF_SCHEMA_VERSION
  ) {
    pushUnique(
      reasons,
      "GROUNDING_INCOMPLETE",
    );
  }

  if (
    grounding.briefMode !== "synthetic_demo" &&
    grounding.briefMode !== "engine_bound"
  ) {
    // Unknown mode string (types preserve only the two known modes).
    pushUnique(
      reasons,
      "INVALID_BRIEF_MODE",
    );
  }

  if (
    !ACTION_TYPES.has(
      grounding.actionType,
    )
  ) {
    pushUnique(
      reasons,
      "GROUNDING_INCOMPLETE",
    );
  }

  if (
    !PRIORITIES.has(
      grounding.priority,
    )
  ) {
    pushUnique(
      reasons,
      "GROUNDING_INCOMPLETE",
    );
  }

  if (
    !CONFIDENCE_LEVELS.has(
      grounding.confidence,
    )
  ) {
    pushUnique(
      reasons,
      "GROUNDING_INCOMPLETE",
    );
  }

  if (
    typeof grounding.productTitle !== "string" ||
    grounding.productTitle.trim().length === 0 ||
    typeof grounding.variantTitle !== "string" ||
    grounding.variantTitle.trim().length === 0
  ) {
    pushUnique(
      reasons,
      "GROUNDING_INCOMPLETE",
    );
  }

  if (
    !Array.isArray(grounding.reasonCodes) ||
    grounding.reasonCodes.length === 0
  ) {
    if (
      grounding.actionType === "WATCH"
    ) {
      pushUnique(
        reasons,
        "WATCH_REASON_CODES_EMPTY",
      );
    } else {
      pushUnique(
        reasons,
        "GROUNDING_INCOMPLETE",
      );
    }
  }

  if (
    !Array.isArray(
      grounding.confidenceReasonCodes,
    )
  ) {
    pushUnique(
      reasons,
      "GROUNDING_INCOMPLETE",
    );
  }

  validateQuantityGrounding(
    grounding,
    reasons,
  );
  validateEvidenceFields(
    grounding,
    reasons,
  );
  validateTrustAndAttestation(
    grounding,
    reasons,
  );

  if (
    reasons.length > 0
  ) {
    return {
      ok: false,
      reasons,
      detail: reasons.join(", "),
    };
  }

  return {
    ok: true,
  };
}

export function isEditableReorderQuantity(
  grounding: DecisionBriefGroundingInput,
): boolean {
  return (
    grounding.actionType === "REORDER" &&
    isKnown(grounding.recommendedQuantity) &&
    isPositiveInteger(
      grounding.recommendedQuantity.value,
    )
  );
}
