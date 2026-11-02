/**
 * Claim-reference and structured numeric/categorical validation.
 *
 * Reuses M0.9.10 numeric-mutation semantics:
 * - omission allowed
 * - asserted values must exactly match grounding
 * - confidencePercent always rejected
 * - reason codes must be a subset of grounding codes
 *
 * Traceability:
 * - Numeric / evidence_fact claims may only reference known evidence fields
 *   with matching values.
 * - Explicit uncertainty_statement claims may also reference unknown evidence
 *   fields.
 * - evidenceRefs membership is necessary, NOT semantic proof for free prose.
 */

import {
  knownNumberOrNull,
} from "@/lib/decision-brief/fields";

import {
  assessBriefNextStepPolicy,
  isWatchPurchaseImplicationText,
} from "@/lib/decision-brief/next-step";

import type {
  BriefClaimValidationResult,
  DecisionBriefActionType,
  DecisionBriefClaim,
  DecisionBriefEvidenceFieldKey,
  DecisionBriefGroundingInput,
  DecisionBriefNextStepCode,
  DecisionBriefRejectionCode,
} from "@/lib/decision-brief/types";

const EVIDENCE_FIELD_KEYS =
  new Set<DecisionBriefEvidenceFieldKey>([
    "availableQuantity",
    "incomingQuantity",
    "demandVelocity",
    "daysOfStock",
    "leadTimeDays",
    "safetyStockUnits",
    "reorderPointUnits",
    "targetStockUnits",
    "inventoryAgeDays",
    "forecastExpectedDemandUnits",
    "dataQualityScore",
  ]);

const FINANCIAL_CLAIM_NEEDLES = [
  "roi",
  "cash at risk",
  "revenue at risk",
  "prevented stockout",
  "moq savings",
  "estimatedcashatrisk",
  "estimatedrevenueatrisk",
] as const;

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

function isEvidenceFieldKey(
  ref: string,
): ref is DecisionBriefEvidenceFieldKey {
  return EVIDENCE_FIELD_KEYS.has(
    ref as DecisionBriefEvidenceFieldKey,
  );
}

export function groundingKnownEvidenceFieldKeys(
  grounding: DecisionBriefGroundingInput,
): ReadonlySet<DecisionBriefEvidenceFieldKey> {
  const keys =
    new Set<DecisionBriefEvidenceFieldKey>();

  for (
    const key of EVIDENCE_FIELD_KEYS
  ) {
    if (
      grounding.evidence[key].state === "known"
    ) {
      keys.add(key);
    }
  }

  return keys;
}

export function groundingUnknownEvidenceFieldKeys(
  grounding: DecisionBriefGroundingInput,
): ReadonlySet<DecisionBriefEvidenceFieldKey> {
  const keys =
    new Set<DecisionBriefEvidenceFieldKey>();

  for (
    const key of EVIDENCE_FIELD_KEYS
  ) {
    if (
      grounding.evidence[key].state === "unknown"
    ) {
      keys.add(key);
    }
  }

  return keys;
}

/**
 * Default allowed refs for non-uncertainty claims:
 * reason codes + confidence reason codes + known evidence field keys only.
 * Unknown evidence keys are intentionally excluded.
 */
export function groundingAllowedEvidenceRefs(
  grounding: DecisionBriefGroundingInput,
): ReadonlySet<string> {
  const refs =
    new Set<string>();

  for (
    const code of grounding.reasonCodes
  ) {
    refs.add(code);
  }

  for (
    const code of grounding.confidenceReasonCodes
  ) {
    refs.add(code);
  }

  for (
    const key of groundingKnownEvidenceFieldKeys(
      grounding,
    )
  ) {
    refs.add(key);
  }

  return refs;
}

/**
 * Uncertainty statements may additionally cite unknown evidence fields.
 * Still not semantic proof of free prose.
 */
export function groundingAllowedUncertaintyEvidenceRefs(
  grounding: DecisionBriefGroundingInput,
): ReadonlySet<string> {
  const refs =
    new Set(
      groundingAllowedEvidenceRefs(
        grounding,
      ),
    );

  for (
    const key of groundingUnknownEvidenceFieldKeys(
      grounding,
    )
  ) {
    refs.add(key);
  }

  return refs;
}

/**
 * Shape compatible with AiDeterministicTruth for parity tests against
 * assessAiNumericMutation (tests/evaluation). Kept in lib without importing
 * the evaluation module to avoid lib → tests coupling.
 */
export type BriefNumericTruthSnapshot = {
  actionType: DecisionBriefActionType | null;
  recommendedQuantity: number | null;
  priority: DecisionBriefGroundingInput["priority"] | null;
  confidence: DecisionBriefGroundingInput["confidence"];
  availableQuantity: number | null;
  incomingQuantity: number | null;
  forecastExpectedDemandUnits: number | null;
  daysOfStock: number | null;
  reorderPointUnits: number | null;
  targetStockUnits: number | null;
  stockoutRisk: null;
  overstockRisk: null;
  dataQualityScore: number | null;
  reasonCodes: readonly string[];
};

export function groundingToNumericTruthSnapshot(
  grounding: DecisionBriefGroundingInput,
): BriefNumericTruthSnapshot {
  return {
    actionType: grounding.actionType,
    recommendedQuantity:
      knownNumberOrNull(
        grounding.recommendedQuantity,
      ),
    priority: grounding.priority,
    confidence: grounding.confidence,
    availableQuantity:
      knownNumberOrNull(
        grounding.evidence.availableQuantity,
      ),
    incomingQuantity:
      knownNumberOrNull(
        grounding.evidence.incomingQuantity,
      ),
    forecastExpectedDemandUnits:
      knownNumberOrNull(
        grounding.evidence.forecastExpectedDemandUnits,
      ),
    daysOfStock:
      knownNumberOrNull(
        grounding.evidence.daysOfStock,
      ),
    reorderPointUnits:
      knownNumberOrNull(
        grounding.evidence.reorderPointUnits,
      ),
    targetStockUnits:
      knownNumberOrNull(
        grounding.evidence.targetStockUnits,
      ),
    stockoutRisk: null,
    overstockRisk: null,
    dataQualityScore:
      knownNumberOrNull(
        grounding.evidence.dataQualityScore,
      ),
    reasonCodes: grounding.reasonCodes,
  };
}

function differs<T>(
  claim: T | undefined,
  truth: T,
): boolean {
  return (
    claim !== undefined &&
    claim !== truth
  );
}

function isNumericEvidenceClaim(
  claim: DecisionBriefClaim,
): boolean {
  if (
    claim.kind === "evidence_fact" ||
    claim.kind === "quantity"
  ) {
    return true;
  }

  return (
    claim.structured?.evidenceField !==
      undefined ||
    claim.structured?.evidenceValue !==
      undefined ||
    claim.structured?.recommendedQuantity !==
      undefined
  );
}

function assessStructuredClaimMutations(
  grounding: DecisionBriefGroundingInput,
  claim: DecisionBriefClaim,
  reasons: DecisionBriefRejectionCode[],
): void {
  const structured =
    claim.structured;

  if (
    !structured
  ) {
    return;
  }

  const truth =
    groundingToNumericTruthSnapshot(
      grounding,
    );

  if (
    differs(
      structured.actionType,
      truth.actionType ?? undefined,
    )
  ) {
    pushUnique(
      reasons,
      "AI_NUMERIC_MUTATION",
    );
  }

  if (
    differs(
      structured.recommendedQuantity,
      truth.recommendedQuantity,
    )
  ) {
    if (
      grounding.recommendedQuantity.state !== "known" &&
      structured.recommendedQuantity !== null &&
      structured.recommendedQuantity !== undefined
    ) {
      pushUnique(
        reasons,
        "QUANTITY_GROUNDING_INCONSISTENT",
      );
    }

    pushUnique(
      reasons,
      "AI_NUMERIC_MUTATION",
    );
  }

  if (
    differs(
      structured.priority,
      truth.priority ?? undefined,
    )
  ) {
    pushUnique(
      reasons,
      "AI_NUMERIC_MUTATION",
    );
  }

  if (
    differs(
      structured.confidence,
      truth.confidence,
    )
  ) {
    pushUnique(
      reasons,
      "AI_NUMERIC_MUTATION",
    );
  }

  if (
    structured.confidencePercent !== undefined
  ) {
    pushUnique(
      reasons,
      "AI_UNSUPPORTED_CONFIDENCE_PERCENT",
    );
  }

  if (
    structured.evidenceField !== undefined
  ) {
    const fieldKey =
      structured.evidenceField;

    if (
      !EVIDENCE_FIELD_KEYS.has(fieldKey)
    ) {
      pushUnique(
        reasons,
        "CLAIM_EVIDENCE_UNTRACED",
      );
    } else {
      const field =
        grounding.evidence[fieldKey];

      // Numeric evidence claims require a known matching value.
      // Uncertainty statements may cite unknown fields without asserting
      // a fabricated known numeric payload.
      if (
        claim.kind === "uncertainty_statement"
      ) {
        if (
          field.state === "known"
        ) {
          if (
            differs(
              structured.evidenceValue,
              field.value,
            )
          ) {
            pushUnique(
              reasons,
              "AI_NUMERIC_MUTATION",
            );
          }
        } else if (
          structured.evidenceValue !== undefined &&
          structured.evidenceValue !== null
        ) {
          // Asserting a concrete number against an unknown field.
          pushUnique(
            reasons,
            "AI_NUMERIC_MUTATION",
          );
          pushUnique(
            reasons,
            "CLAIM_EVIDENCE_UNTRACED",
          );
        }
      } else if (
        field.state !== "known"
      ) {
        pushUnique(
          reasons,
          "CLAIM_EVIDENCE_UNTRACED",
        );
      } else if (
        differs(
          structured.evidenceValue,
          field.value,
        )
      ) {
        pushUnique(
          reasons,
          "AI_NUMERIC_MUTATION",
        );
      }
    }
  }

  if (
    structured.reasonCodes !== undefined
  ) {
    const trusted =
      new Set(
        grounding.reasonCodes,
      );

    if (
      structured.reasonCodes.some(
        (code) => !trusted.has(code),
      )
    ) {
      pushUnique(
        reasons,
        "AI_FABRICATED_REASON_CODE",
      );
    }
  }
}

function assessClaimEvidenceRefs(
  grounding: DecisionBriefGroundingInput,
  claim: DecisionBriefClaim,
  reasons: DecisionBriefRejectionCode[],
): void {
  const allowedRefs =
    claim.kind === "uncertainty_statement"
      ? groundingAllowedUncertaintyEvidenceRefs(
          grounding,
        )
      : groundingAllowedEvidenceRefs(
          grounding,
        );

  if (
    (
      claim.structured ||
      isNumericEvidenceClaim(claim)
    ) &&
    claim.evidenceRefs.length === 0
  ) {
    pushUnique(
      reasons,
      "CLAIM_EVIDENCE_UNTRACED",
    );
    return;
  }

  for (
    const ref of claim.evidenceRefs
  ) {
    if (
      !allowedRefs.has(ref)
    ) {
      pushUnique(
        reasons,
        "CLAIM_EVIDENCE_UNTRACED",
      );
      return;
    }

    // Non-uncertainty claims must not cite unknown evidence fields
    // even if somehow present in a broader set.
    if (
      claim.kind !== "uncertainty_statement" &&
      isEvidenceFieldKey(ref) &&
      grounding.evidence[ref].state !== "known"
    ) {
      pushUnique(
        reasons,
        "CLAIM_EVIDENCE_UNTRACED",
      );
      return;
    }
  }
}

function assessFinancialOrWatchProse(
  grounding: DecisionBriefGroundingInput,
  claim: DecisionBriefClaim,
  reasons: DecisionBriefRejectionCode[],
): void {
  const normalized =
    claim.text.toLowerCase().replace(
      /\s+/g,
      " ",
    );

  for (
    const needle of FINANCIAL_CLAIM_NEEDLES
  ) {
    if (
      normalized.includes(needle)
    ) {
      pushUnique(
        reasons,
        "AI_UNSUPPORTED_FINANCIAL_CLAIM",
      );
      break;
    }
  }

  if (
    grounding.actionType === "WATCH" &&
    isWatchPurchaseImplicationText(
      claim.text,
    )
  ) {
    pushUnique(
      reasons,
      "AI_WATCH_PURCHASE_IMPLICATION",
    );
  }
}

/**
 * Validate DecisionBriefClaim[] against grounding.
 * Structured numeric checks mirror M0.9.10; prose still needs E3 semantic profile.
 * evidenceRefs membership alone is not semantic proof.
 */
export function validateBriefClaims(
  grounding: DecisionBriefGroundingInput,
  claims: readonly DecisionBriefClaim[],
): BriefClaimValidationResult {
  const reasons:
    DecisionBriefRejectionCode[] =
      [];

  for (
    const claim of claims
  ) {
    assessClaimEvidenceRefs(
      grounding,
      claim,
      reasons,
    );
    assessStructuredClaimMutations(
      grounding,
      claim,
      reasons,
    );
    assessFinancialOrWatchProse(
      grounding,
      claim,
      reasons,
    );
  }

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

/**
 * E0/E1 semantic-validation boundary: AI prose must not be delivered as
 * ai_validated until a separately approved semantic profile accepts it.
 * Structured numeric + evidenceRefs alone are insufficient.
 */
export function assessAiProseSemanticGate(options: {
  semanticProfileApproved: boolean;
  semanticProfileAccepted?: boolean;
}): BriefClaimValidationResult {
  if (
    !options.semanticProfileApproved
  ) {
    return {
      ok: false,
      reasons: [
        "AI_PROSE_SEMANTIC_VALIDATION_REQUIRED",
      ],
      detail:
        "AI prose delivery requires a separately approved semantic/claim-validation profile.",
    };
  }

  if (
    options.semanticProfileAccepted !== true
  ) {
    return {
      ok: false,
      reasons: [
        "AI_PROSE_SEMANTIC_VALIDATION_REJECTED",
      ],
      detail:
        "Semantic/claim-validation profile rejected the AI prose candidate.",
    };
  }

  return {
    ok: true,
  };
}

export function validateNextStepAgainstGrounding(
  grounding: DecisionBriefGroundingInput,
  nextStepCode: DecisionBriefNextStepCode,
): BriefClaimValidationResult {
  return assessBriefNextStepPolicy(
    grounding.actionType,
    nextStepCode,
  );
}
