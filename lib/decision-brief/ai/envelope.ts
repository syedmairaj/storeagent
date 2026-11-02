/**
 * M7.4e E3.1 — DeterministicGroundingEnvelope builder.
 * Call only AFTER validateGrounding() succeeds.
 */

import {
  groundingAllowedEvidenceRefs,
  groundingAllowedUncertaintyEvidenceRefs,
} from "@/lib/decision-brief/validate-claims";

import {
  defaultNextStepCode,
} from "@/lib/decision-brief/next-step";

import type {
  DecisionBriefActionType,
  DecisionBriefGroundingInput,
  DecisionBriefNextStepCode,
} from "@/lib/decision-brief/types";

import {
  computeGroundingHash,
} from "@/lib/decision-brief/ai/grounding-hash";

import {
  AI_BRIEF_SEMANTIC_CLAIMS_VERSION,
  AI_EXPLANATION_ADAPTER_CONTRACT_VERSION,
  AI_NUMERIC_MUTATION_PROFILE_VERSION,
  DECISION_BRIEF_GROUNDING_HASH_VERSION,
  type DeterministicGroundingEnvelope,
} from "@/lib/decision-brief/ai/types";

const DEFAULT_PROMPT_VERSION =
  "offline-stub-prompt-v1";

function allowedNextStepCodesFor(
  actionType: DecisionBriefActionType,
): readonly DecisionBriefNextStepCode[] {
  switch (
    actionType
  ) {
    case "REORDER":
      return [
        "review_reorder",
        "edit_reorder_quantity",
        "no_execution",
      ];
    case "REDUCE":
      return [
        "reduce_incoming_exposure",
        "no_execution",
      ];
    case "PROMOTE":
      return [
        "plan_promotion",
        "no_execution",
      ];
    case "WATCH":
      return [
        "investigate_watch",
        "dismiss_watch",
        "no_execution",
      ];
    default: {
      const _exhaustive: never =
        actionType;
      return _exhaustive;
    }
  }
}

function deepFreeze<T>(
  value: T,
): T {
  if (
    value === null ||
    typeof value !== "object"
  ) {
    return value;
  }

  if (
    Object.isFrozen(value)
  ) {
    return value;
  }

  for (
    const child of Object.values(
      value as Record<string, unknown>,
    )
  ) {
    deepFreeze(child);
  }

  return Object.freeze(value);
}

export type BuildDeterministicGroundingEnvelopeOptions = {
  briefId: string;
  promptVersion?: string;
  /**
   * Include unknown evidence keys in allowedEvidenceRefs
   * (uncertainty statements may cite them).
   */
  includeUncertaintyEvidenceRefs?: boolean;
};

/**
 * Build an immutable envelope from validated synthetic_demo grounding.
 * Throws if briefMode is not synthetic_demo (engine_bound forbidden in E3.x).
 */
export function buildDeterministicGroundingEnvelope(
  grounding: DecisionBriefGroundingInput,
  options: BuildDeterministicGroundingEnvelopeOptions,
): DeterministicGroundingEnvelope {
  if (
    grounding.briefMode !== "synthetic_demo"
  ) {
    throw new Error(
      "DeterministicGroundingEnvelope requires briefMode=synthetic_demo in E3.x.",
    );
  }

  const allowedRefs =
    options.includeUncertaintyEvidenceRefs === false
      ? groundingAllowedEvidenceRefs(
          grounding,
        )
      : groundingAllowedUncertaintyEvidenceRefs(
          grounding,
        );

  // Ensure default next-step code remains in the allowlist.
  const nextSteps =
    allowedNextStepCodesFor(
      grounding.actionType,
    );
  const defaultCode =
    defaultNextStepCode(
      grounding.actionType,
    );

  if (
    !nextSteps.includes(defaultCode)
  ) {
    throw new Error(
      `Default next-step ${defaultCode} missing from envelope allowlist.`,
    );
  }

  const groundingCopy =
    structuredClone(
      grounding,
    );

  const envelope: DeterministicGroundingEnvelope = {
    schemaVersion: "decision-brief-v1",
    adapterContractVersion:
      AI_EXPLANATION_ADAPTER_CONTRACT_VERSION,
    groundingSerializationVersion:
      DECISION_BRIEF_GROUNDING_HASH_VERSION,
    briefMode: "synthetic_demo",
    groundingHash: computeGroundingHash(
      groundingCopy,
    ),
    grounding: groundingCopy,
    constraints: {
      allowedActionType: groundingCopy.actionType,
      allowedNextStepCodes: nextSteps,
      allowedEvidenceRefs: [
        ...allowedRefs,
      ],
      forbidFinancialClaims: true,
      forbidConfidencePercent: true,
      forbidWatchPurchaseImplication:
        groundingCopy.actionType === "WATCH",
      maxWhyNowSentences: 3,
      maxUncertaintySentences: 3,
      maxNextStepSentences: 2,
    },
    request: {
      organizationId: groundingCopy.organizationId,
      briefId: options.briefId,
      locale: "en-US",
      promptVersion:
        options.promptVersion ??
        DEFAULT_PROMPT_VERSION,
      semanticProfileVersion:
        AI_BRIEF_SEMANTIC_CLAIMS_VERSION,
      numericProfileVersion:
        AI_NUMERIC_MUTATION_PROFILE_VERSION,
    },
  };

  return deepFreeze(
    envelope,
  );
}
