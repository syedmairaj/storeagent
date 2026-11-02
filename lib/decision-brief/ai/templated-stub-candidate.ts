/**
 * M7.4e E3.2 — offline stub candidate that matches ai-brief-semantic-claims-v1.
 *
 * Used for harness acceptance tests only. Merchant delivery remains
 * deterministic_fallback under forceDeterministicFallback.
 *
 * Each material prose sentence is mirrored by a claim with matching kind,
 * exact text, and template-required grounded evidenceRefs.
 */

import {
  isKnown,
} from "@/lib/decision-brief/fields";

import {
  defaultNextStepCode,
} from "@/lib/decision-brief/next-step";

import {
  buildTemplatedSemanticProse,
  selectTemplatedEvidenceRefs,
} from "@/lib/decision-brief/semantic-claims-v1";

import {
  AI_BRIEF_SEMANTIC_CLAIMS_VERSION,
  AI_EXPLANATION_ADAPTER_CONTRACT_VERSION,
  type AiExplanationCandidateV1,
  type DeterministicGroundingEnvelope,
} from "@/lib/decision-brief/ai/types";

import type {
  DecisionBriefClaim,
} from "@/lib/decision-brief/types";

function refsOrFallback(
  refs: readonly string[],
  fallback: readonly string[],
): string[] {
  if (
    refs.length > 0
  ) {
    return [
      ...refs,
    ];
  }

  return [
    ...fallback,
  ];
}

export function buildTemplatedOfflineStubCandidate(
  envelope: DeterministicGroundingEnvelope,
  options?: {
    provider?: string;
    model?: string;
  },
): AiExplanationCandidateV1 | null {
  const nextStepCode =
    defaultNextStepCode(
      envelope.grounding.actionType,
    );

  const prose =
    buildTemplatedSemanticProse(
      envelope.grounding,
      nextStepCode,
    );

  if (
    !prose
  ) {
    return null;
  }

  const whyRefs =
    selectTemplatedEvidenceRefs(
      envelope.grounding,
      "whyNow",
    );
  const uncRefs =
    selectTemplatedEvidenceRefs(
      envelope.grounding,
      "uncertainty",
    );
  const nextRefs =
    selectTemplatedEvidenceRefs(
      envelope.grounding,
      "nextStep",
    );

  const reasonFallback =
    envelope.grounding.reasonCodes.slice(0, 3);

  const claims: DecisionBriefClaim[] = [
    {
      claimId: "templated-why-now",
      kind: "why_now_statement",
      text: prose.whyNowSummary,
      structured: {
        actionType: envelope.grounding.actionType,
        priority: envelope.grounding.priority,
        confidence: envelope.grounding.confidence,
        reasonCodes: [
          ...envelope.grounding.reasonCodes,
        ],
      },
      evidenceRefs: refsOrFallback(
        whyRefs,
        reasonFallback,
      ),
    },
    {
      claimId: "templated-uncertainty",
      kind: "uncertainty_statement",
      text: prose.uncertaintySummary,
      evidenceRefs: refsOrFallback(
        uncRefs,
        reasonFallback,
      ),
    },
    {
      claimId: "templated-next-step",
      kind: "next_step_statement",
      text: prose.nextStepSummary,
      structured: {
        actionType: envelope.grounding.actionType,
      },
      evidenceRefs: refsOrFallback(
        nextRefs,
        reasonFallback.length > 0
          ? reasonFallback
          : [
              "availableQuantity",
            ],
      ),
    },
  ];

  if (
    envelope.grounding.actionType === "REORDER" &&
    isKnown(
      envelope.grounding.recommendedQuantity,
    )
  ) {
    // Structured quantity claim (not a prose sentence in the default why trio).
    claims.push({
      claimId: "templated-quantity",
      kind: "quantity",
      text: `Recommended quantity ${envelope.grounding.recommendedQuantity.value}.`,
      structured: {
        recommendedQuantity:
          envelope.grounding.recommendedQuantity.value,
      },
      evidenceRefs: refsOrFallback(
        whyRefs,
        reasonFallback,
      ),
    });
  }

  return {
    schemaVersion:
      AI_EXPLANATION_ADAPTER_CONTRACT_VERSION,
    adapterId: "offline_stub",
    provider: options?.provider ?? "stub",
    model: options?.model ?? "stub-semantic-v1",
    promptVersion: envelope.request.promptVersion,
    semanticProfileVersion:
      AI_BRIEF_SEMANTIC_CLAIMS_VERSION,
    groundingHash: envelope.groundingHash,
    prose,
    claims,
    suggestedNextStepCode: nextStepCode,
    usage: {
      latencyMs: 1,
      inputTokenEstimate: 0,
      outputTokenEstimate: 0,
    },
  };
}
