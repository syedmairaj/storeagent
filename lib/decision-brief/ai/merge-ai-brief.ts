/**
 * M7.4e E3.3 — merge a *minted* validated AI candidate into a DecisionBriefV1.
 *
 * INTERNAL to the AI adapter package. Not re-exported from the public barrel.
 * Only the orchestrator should call this after validateAiExplanationCandidate
 * mints a SemanticallyValidatedAiExplanationCandidate.
 *
 * Engine-owned recommendation / evidence / controls / trust remain from
 * the deterministic fallback base. Only explanation prose + claims +
 * next-step wording/code (already policy-checked) are replaced.
 */

import {
  buildDeterministicFallbackBrief,
} from "@/lib/decision-brief/fallback-brief";

import {
  defaultNextStepCode,
} from "@/lib/decision-brief/next-step";

import type {
  OrganizationMemberRole,
} from "@/lib/commerce-domain/types";

import {
  isSemanticallyValidatedCandidate,
  type SemanticallyValidatedAiExplanationCandidate,
} from "@/lib/decision-brief/ai/validated-candidate";

import type {
  DecisionBriefClaim,
  DecisionBriefGroundingInput,
  DecisionBriefRejectionCode,
  DecisionBriefV1,
} from "@/lib/decision-brief/types";

export type MergeAiValidatedBriefResult =
  | {
      ok: true;
      brief: DecisionBriefV1;
    }
  | {
      ok: false;
      reasons: readonly DecisionBriefRejectionCode[];
      detail: string;
    };

function partitionClaims(
  claims: readonly DecisionBriefClaim[],
): {
  whyNow: DecisionBriefClaim[];
  uncertainty: DecisionBriefClaim[];
  nextStep: DecisionBriefClaim[];
} {
  const whyNow: DecisionBriefClaim[] = [];
  const uncertainty: DecisionBriefClaim[] = [];
  const nextStep: DecisionBriefClaim[] = [];

  for (
    const claim of claims
  ) {
    if (
      claim.kind === "uncertainty_statement"
    ) {
      uncertainty.push(claim);
      continue;
    }

    if (
      claim.kind === "next_step_statement"
    ) {
      nextStep.push(claim);
      continue;
    }

    // why_now_statement and supporting structured kinds shown under why-now.
    whyNow.push(claim);
  }

  return {
    whyNow,
    uncertainty,
    nextStep,
  };
}

/**
 * Build an ai_validated brief from grounding + minted validated candidate.
 * Unminted / forged tokens fail closed — never labels arbitrary prose.
 */
export function mergeAiValidatedBrief(
  grounding: DecisionBriefGroundingInput,
  validated: SemanticallyValidatedAiExplanationCandidate | unknown,
  options: {
    briefId: string;
    role: OrganizationMemberRole;
    generatedAt?: string;
  },
): MergeAiValidatedBriefResult {
  if (
    !isSemanticallyValidatedCandidate(
      validated,
    )
  ) {
    return {
      ok: false,
      reasons: [
        "AI_UNSUPPORTED_SHAPE",
      ],
      detail:
        "ai_validated merge refused: candidate was not minted by semantic validation.",
    };
  }

  const candidate =
    validated.candidate;

  const base =
    buildDeterministicFallbackBrief(
      grounding,
      {
        briefId: options.briefId,
        role: options.role,
        generatedAt: options.generatedAt,
      },
    );

  if (
    !base.ok
  ) {
    return base;
  }

  const partitioned =
    partitionClaims(
      candidate.claims,
    );

  const nextStepCode =
    candidate.suggestedNextStepCode ??
    defaultNextStepCode(
      grounding.actionType,
    );

  const brief: DecisionBriefV1 = {
    ...base.brief,
    generator: "ai_validated",
    validationStatus: "accepted",
    whyNow: {
      summary: candidate.prose.whyNowSummary,
      claims:
        partitioned.whyNow.length > 0
          ? partitioned.whyNow
          : base.brief.whyNow.claims,
    },
    uncertainty: {
      ...base.brief.uncertainty,
      summary: candidate.prose.uncertaintySummary,
      claims:
        partitioned.uncertainty.length > 0
          ? partitioned.uncertainty
          : base.brief.uncertainty.claims,
    },
    suggestedNextStep: {
      code: nextStepCode,
      summary: candidate.prose.nextStepSummary,
      claims:
        partitioned.nextStep.length > 0
          ? partitioned.nextStep
          : base.brief.suggestedNextStep.claims,
    },
    humanControls: {
      ...base.brief.humanControls,
      productionApprovalEligible: false,
    },
    provenance: {
      ...base.brief.provenance,
      ai: {
        provider: candidate.provider,
        model: candidate.model,
        promptVersion: candidate.promptVersion,
        latencyMs:
          candidate.usage?.latencyMs ?? 0,
        inputTokenEstimate:
          candidate.usage?.inputTokenEstimate,
        outputTokenEstimate:
          candidate.usage?.outputTokenEstimate,
      },
    },
  };

  // Strip any rejection chrome from the base path.
  delete (
    brief as {
      rejection?: DecisionBriefV1["rejection"];
    }
  ).rejection;

  return {
    ok: true,
    brief,
  };
}

/**
 * Apply rejected_used_fallback chrome onto an otherwise valid fallback brief.
 * Internal — used by the orchestrator only.
 */
export function withRejectedUsedFallback(
  brief: DecisionBriefV1,
  reasons: readonly DecisionBriefRejectionCode[],
  detail: string,
): DecisionBriefV1 {
  return {
    ...brief,
    generator: "deterministic_fallback",
    validationStatus: "rejected_used_fallback",
    rejection: {
      reasons,
      detail,
    },
    humanControls: {
      ...brief.humanControls,
      productionApprovalEligible: false,
    },
  };
}
