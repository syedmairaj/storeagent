/**
 * M7.4e E3.1 — AI candidate shape / hash / claim / next-step / semantic gates.
 *
 * Reuses E1 validators. Semantic profile remains unapproved in E3.1,
 * so assessAiProseSemanticGate rejects until E3.2.
 *
 * Nested claim shapes are checked before calling E1 validators so
 * malformed stub output cannot throw through validation.
 */

import {
  assessAiProseSemanticGate,
  validateBriefClaims,
  validateNextStepAgainstGrounding,
} from "@/lib/decision-brief/validate-claims";

import {
  isWatchPurchaseImplicationText,
} from "@/lib/decision-brief/next-step";

import {
  groundingHashesEqual,
} from "@/lib/decision-brief/ai/grounding-hash";

import {
  AI_BRIEF_SEMANTIC_CLAIMS_VERSION,
  AI_EXPLANATION_ADAPTER_CONTRACT_VERSION,
  type AiExplanationCandidateV1,
  type CandidateShapeValidationResult,
  type DeterministicGroundingEnvelope,
} from "@/lib/decision-brief/ai/types";

import type {
  DecisionBriefClaim,
  DecisionBriefEvidenceFieldKey,
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

const CLAIM_KINDS =
  new Set([
    "action_type",
    "quantity",
    "priority",
    "confidence",
    "evidence_fact",
    "reason_code",
    "why_now_statement",
    "uncertainty_statement",
    "next_step_statement",
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

function isNonEmptyString(
  value: unknown,
): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0
  );
}

function unsupportedShape(
  detail: string,
): CandidateShapeValidationResult {
  return {
    ok: false,
    reasons: [
      "AI_UNSUPPORTED_SHAPE",
    ],
    detail,
    adapterReason: "AI_UNSUPPORTED_SHAPE",
  };
}

/**
 * Fail-closed nested claim element validation before E1 claim gates.
 */
export function validateCandidateClaimNesting(
  claims: unknown,
): CandidateShapeValidationResult {
  if (
    !Array.isArray(claims)
  ) {
    return unsupportedShape(
      "AI candidate claims must be an array.",
    );
  }

  for (
    const claim of claims
  ) {
    if (
      claim === null ||
      typeof claim !== "object" ||
      Array.isArray(claim)
    ) {
      return unsupportedShape(
        "Each AI candidate claim must be a non-null object.",
      );
    }

    const row =
      claim as Record<string, unknown>;

    if (
      !isNonEmptyString(row.claimId)
    ) {
      return unsupportedShape(
        "AI candidate claim.claimId must be a non-empty string.",
      );
    }

    if (
      typeof row.kind !== "string" ||
      !CLAIM_KINDS.has(row.kind)
    ) {
      return unsupportedShape(
        "AI candidate claim.kind is missing or unsupported.",
      );
    }

    if (
      typeof row.text !== "string"
    ) {
      return unsupportedShape(
        "AI candidate claim.text must be a string.",
      );
    }

    if (
      !Array.isArray(row.evidenceRefs) ||
      row.evidenceRefs.some(
        (ref) => typeof ref !== "string",
      )
    ) {
      return unsupportedShape(
        "AI candidate claim.evidenceRefs must be a string array.",
      );
    }

    if (
      row.structured !== undefined
    ) {
      if (
        row.structured === null ||
        typeof row.structured !== "object" ||
        Array.isArray(row.structured)
      ) {
        return unsupportedShape(
          "AI candidate claim.structured must be a plain object when present.",
        );
      }

      const structured =
        row.structured as Record<string, unknown>;

      if (
        structured.reasonCodes !== undefined &&
        (
          !Array.isArray(structured.reasonCodes) ||
          structured.reasonCodes.some(
            (code) => typeof code !== "string",
          )
        )
      ) {
        return unsupportedShape(
          "AI candidate claim.structured.reasonCodes must be a string array.",
        );
      }

      if (
        structured.evidenceField !== undefined &&
        typeof structured.evidenceField !== "string"
      ) {
        return unsupportedShape(
          "AI candidate claim.structured.evidenceField must be a string.",
        );
      }

      if (
        structured.confidencePercent !== undefined &&
        typeof structured.confidencePercent !== "number"
      ) {
        return unsupportedShape(
          "AI candidate claim.structured.confidencePercent must be a number when present.",
        );
      }
    }
  }

  return {
    ok: true,
  };
}

/**
 * Validate candidate shape and groundingHash binding (reproducibility only).
 */
export function validateCandidateShape(
  envelope: DeterministicGroundingEnvelope,
  candidate: unknown,
): CandidateShapeValidationResult {
  const reasons: DecisionBriefRejectionCode[] = [];

  if (
    candidate === null ||
    typeof candidate !== "object" ||
    Array.isArray(candidate)
  ) {
    return unsupportedShape(
      "AI candidate must be a non-null object.",
    );
  }

  const value =
    candidate as Partial<AiExplanationCandidateV1> & {
      prose?: Partial<AiExplanationCandidateV1["prose"]> | null;
      claims?: unknown;
      evidenceEmphasis?: unknown;
    };

  if (
    value.schemaVersion !==
    AI_EXPLANATION_ADAPTER_CONTRACT_VERSION
  ) {
    pushUnique(
      reasons,
      "AI_UNSUPPORTED_SHAPE",
    );
  }

  if (
    value.adapterId !== "offline_stub" &&
    value.adapterId !== "recorded_replay"
  ) {
    // live_provider is reserved and not instantiable in E3.x
    pushUnique(
      reasons,
      "AI_UNSUPPORTED_SHAPE",
    );
  }

  if (
    !isNonEmptyString(value.provider) ||
    !isNonEmptyString(value.model) ||
    !isNonEmptyString(value.promptVersion)
  ) {
    pushUnique(
      reasons,
      "AI_UNSUPPORTED_SHAPE",
    );
  }

  if (
    value.semanticProfileVersion !==
    AI_BRIEF_SEMANTIC_CLAIMS_VERSION
  ) {
    pushUnique(
      reasons,
      "AI_UNSUPPORTED_SHAPE",
    );
  }

  if (
    !isNonEmptyString(value.groundingHash)
  ) {
    pushUnique(
      reasons,
      "AI_UNSUPPORTED_SHAPE",
    );
  } else if (
    !groundingHashesEqual(
      value.groundingHash,
      envelope.groundingHash,
    )
  ) {
    return {
      ok: false,
      reasons: [
        "CLAIM_EVIDENCE_UNTRACED",
      ],
      detail:
        "Candidate groundingHash does not match envelope (reproducibility binding only; not attestation).",
      adapterReason: "GROUNDING_HASH_MISMATCH",
    };
  }

  if (
    value.prose === null ||
    typeof value.prose !== "object" ||
    Array.isArray(value.prose) ||
    !isNonEmptyString(value.prose.whyNowSummary) ||
    typeof value.prose.uncertaintySummary !== "string" ||
    !isNonEmptyString(value.prose.nextStepSummary)
  ) {
    pushUnique(
      reasons,
      "AI_UNSUPPORTED_SHAPE",
    );
  }

  const claimNesting =
    validateCandidateClaimNesting(
      value.claims,
    );

  if (
    !claimNesting.ok
  ) {
    for (
      const code of claimNesting.reasons
    ) {
      pushUnique(
        reasons,
        code,
      );
    }
  }

  if (
    value.evidenceEmphasis !== undefined
  ) {
    if (
      !Array.isArray(value.evidenceEmphasis)
    ) {
      pushUnique(
        reasons,
        "AI_UNSUPPORTED_SHAPE",
      );
    } else {
      for (
        const key of value.evidenceEmphasis
      ) {
        if (
          typeof key !== "string" ||
          !EVIDENCE_FIELD_KEYS.has(
            key as DecisionBriefEvidenceFieldKey,
          )
        ) {
          pushUnique(
            reasons,
            "CLAIM_EVIDENCE_UNTRACED",
          );
          break;
        }

        if (
          envelope.grounding.evidence[
            key as DecisionBriefEvidenceFieldKey
          ].state !== "known"
        ) {
          pushUnique(
            reasons,
            "CLAIM_EVIDENCE_UNTRACED",
          );
          break;
        }
      }
    }
  }

  if (
    value.suggestedNextStepCode !== undefined &&
    typeof value.suggestedNextStepCode !== "string"
  ) {
    pushUnique(
      reasons,
      "AI_UNSUPPORTED_SHAPE",
    );
  }

  if (
    reasons.length > 0
  ) {
    return {
      ok: false,
      reasons,
      detail: reasons.join(", "),
      adapterReason: reasons.includes(
        "CLAIM_EVIDENCE_UNTRACED",
      )
        ? undefined
        : "AI_UNSUPPORTED_SHAPE",
    };
  }

  return {
    ok: true,
  };
}

/**
 * Full E3.1 harness validation: shape → claims → next-step → semantic gate.
 * E3.1 always discards delivery even when structured gates pass; semantic
 * gate rejects until E3.2 profile approval.
 *
 * Accepts unknown runtime candidates; never throws to the caller.
 */
export function validateAiExplanationCandidate(
  envelope: DeterministicGroundingEnvelope,
  candidate: unknown,
): CandidateShapeValidationResult {
  try {
    const shape =
      validateCandidateShape(
        envelope,
        candidate,
      );

    if (
      !shape.ok
    ) {
      return shape;
    }

    const typed =
      candidate as AiExplanationCandidateV1;
    const reasons: DecisionBriefRejectionCode[] = [];

    const claimValidation =
      validateBriefClaims(
        envelope.grounding,
        typed.claims as readonly DecisionBriefClaim[],
      );

    if (
      !claimValidation.ok
    ) {
      for (
        const code of claimValidation.reasons
      ) {
        pushUnique(
          reasons,
          code,
        );
      }
    }

    const proseParts = [
      typed.prose.whyNowSummary,
      typed.prose.uncertaintySummary,
      typed.prose.nextStepSummary,
    ];

    for (
      const text of proseParts
    ) {
      if (
        envelope.constraints.forbidWatchPurchaseImplication &&
        isWatchPurchaseImplicationText(text)
      ) {
        pushUnique(
          reasons,
          "AI_WATCH_PURCHASE_IMPLICATION",
        );
      }
    }

    const nextStepCode =
      typed.suggestedNextStepCode ??
      envelope.constraints.allowedNextStepCodes[0];

    if (
      typed.suggestedNextStepCode !== undefined
    ) {
      if (
        !envelope.constraints.allowedNextStepCodes.includes(
          typed.suggestedNextStepCode,
        )
      ) {
        pushUnique(
          reasons,
          envelope.grounding.actionType === "WATCH"
            ? "AI_WATCH_PURCHASE_IMPLICATION"
            : "GROUNDING_INCOMPLETE",
        );
      }

      const nextStepPolicy =
        validateNextStepAgainstGrounding(
          envelope.grounding,
          typed.suggestedNextStepCode,
        );

      if (
        !nextStepPolicy.ok
      ) {
        for (
          const code of nextStepPolicy.reasons
        ) {
          pushUnique(
            reasons,
            code,
          );
        }
      }
    } else if (
      nextStepCode !== undefined
    ) {
      const nextStepPolicy =
        validateNextStepAgainstGrounding(
          envelope.grounding,
          nextStepCode,
        );

      if (
        !nextStepPolicy.ok
      ) {
        for (
          const code of nextStepPolicy.reasons
        ) {
          pushUnique(
            reasons,
            code,
          );
        }
      }
    }

    // E3.1: semantic profile is not approved; gate must reject.
    const semantic =
      assessAiProseSemanticGate({
        semanticProfileApproved: false,
      });

    if (
      !semantic.ok
    ) {
      for (
        const code of semantic.reasons
      ) {
        pushUnique(
          reasons,
          code,
        );
      }
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
  } catch {
    return unsupportedShape(
      "Candidate validation failed closed on unexpected error.",
    );
  }
}
