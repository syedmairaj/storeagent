/**
 * M7.4e E3.1 — offline_stub AI explanation adapter.
 *
 * Absolutely no network access. supportsLiveNetwork=false.
 * Returns fixture-shaped candidates or intentional failures for harness use.
 * E3.1 orchestrator always discards candidates before merchant delivery.
 */

import {
  defaultNextStepCode,
  defaultNextStepSummary,
} from "@/lib/decision-brief/next-step";

import {
  AI_BRIEF_SEMANTIC_CLAIMS_VERSION,
  AI_EXPLANATION_ADAPTER_CONTRACT_VERSION,
  type AiExplanationAdapter,
  type AiExplanationAdapterResult,
  type AiExplanationCandidateV1,
  type AiExplanationGenerateOptions,
  type DeterministicGroundingEnvelope,
} from "@/lib/decision-brief/ai/types";

import type {
  DecisionBriefClaim,
} from "@/lib/decision-brief/types";

export type OfflineStubBehavior =
  | {
      mode: "valid_looking";
    }
  | {
      mode: "error";
      reason?:
        | "AI_UNAVAILABLE"
        | "AI_UNSUPPORTED_SHAPE"
        | "AI_PROMPT_INJECTION_SUSPECT"
        | "COST_CAP_EXCEEDED";
      detail?: string;
    }
  | {
      mode: "hash_mismatch";
    }
  | {
      mode: "unsupported_shape";
    }
  | {
      mode: "rejected_claims";
    }
  | {
      /**
       * Nested claim fields that would throw naive validators
       * (non-string text, non-array evidenceRefs).
       */
      mode: "malformed_nested_claims";
    }
  | {
      /**
       * Ignore AbortSignal and resolve after delayMs (default timeout+500).
       * Orchestrator must discard the late result.
       */
      mode: "ignore_abort_late";
      delayMs?: number;
    }
  | {
      mode: "hang_until_abort";
    }
  | {
      mode: "custom";
      candidate: AiExplanationCandidateV1;
    };

export type OfflineStubAdapterOptions = {
  behavior?: OfflineStubBehavior;
  provider?: string;
  model?: string;
};

function buildValidLookingCandidate(
  envelope: DeterministicGroundingEnvelope,
  options: OfflineStubAdapterOptions,
): AiExplanationCandidateV1 {
  const actionType =
    envelope.grounding.actionType;
  const nextStepCode =
    defaultNextStepCode(
      actionType,
    );
  const whyNow =
    envelope.grounding.deterministicFallbackCopy
      ?.whyNow?.trim() ||
    `${actionType} is indicated by available evidence.`;
  const nextStep =
    envelope.grounding.deterministicFallbackCopy
      ?.suggestedNextStep?.trim() ||
    defaultNextStepSummary(
      actionType,
    );
  const uncertainty =
    actionType === "WATCH"
      ? "Uncertainty is primary; StoreAgent is watching rather than intervening."
      : "No material uncertainty flagged.";

  const reasonRefs =
    envelope.grounding.reasonCodes.slice(0, 3);

  const claims: DecisionBriefClaim[] = [
    {
      claimId: "stub-why-now",
      kind: "why_now_statement",
      text: whyNow,
      structured: {
        actionType,
        priority: envelope.grounding.priority,
        confidence: envelope.grounding.confidence,
        reasonCodes: [
          ...envelope.grounding.reasonCodes,
        ],
      },
      evidenceRefs:
        reasonRefs.length > 0
          ? reasonRefs
          : [
              "availableQuantity",
            ],
    },
    {
      claimId: "stub-uncertainty",
      kind: "uncertainty_statement",
      text: uncertainty,
      evidenceRefs: [
        ...reasonRefs,
      ],
    },
    {
      claimId: "stub-next-step",
      kind: "next_step_statement",
      text: nextStep,
      structured: {
        actionType,
      },
      evidenceRefs:
        reasonRefs.length > 0
          ? reasonRefs
          : [
              "availableQuantity",
            ],
    },
  ];

  return {
    schemaVersion:
      AI_EXPLANATION_ADAPTER_CONTRACT_VERSION,
    adapterId: "offline_stub",
    provider: options.provider ?? "stub",
    model: options.model ?? "stub-v1",
    promptVersion: envelope.request.promptVersion,
    semanticProfileVersion:
      AI_BRIEF_SEMANTIC_CLAIMS_VERSION,
    groundingHash: envelope.groundingHash,
    prose: {
      whyNowSummary: whyNow,
      uncertaintySummary: uncertainty,
      nextStepSummary: nextStep,
    },
    claims,
    suggestedNextStepCode: nextStepCode,
    usage: {
      latencyMs: 1,
      inputTokenEstimate: 0,
      outputTokenEstimate: 0,
    },
  };
}

function delay(
  ms: number,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise(
    (resolve, reject) => {
      if (
        signal?.aborted
      ) {
        reject(
          new Error(
            "Aborted",
          ),
        );
        return;
      }

      const timer =
        setTimeout(
          () => resolve(),
          ms,
        );

      if (
        !signal
      ) {
        return;
      }

      const onAbort =
        () => {
          clearTimeout(timer);
          reject(
            new Error(
              "Aborted",
            ),
          );
        };

      signal.addEventListener(
        "abort",
        onAbort,
        {
          once: true,
        },
      );
    },
  );
}

/**
 * Offline stub adapter. Never performs network I/O.
 */
export function createOfflineStubAdapter(
  options: OfflineStubAdapterOptions = {},
): AiExplanationAdapter {
  const behavior: OfflineStubBehavior =
    options.behavior ?? {
      mode: "valid_looking",
    };

  return {
    adapterId: "offline_stub",
    supportsLiveNetwork: false,

    async generate(
      envelope: DeterministicGroundingEnvelope,
      generateOptions: AiExplanationGenerateOptions,
    ): Promise<AiExplanationAdapterResult> {
      switch (
        behavior.mode
      ) {
        case "error":
          return {
            ok: false,
            reason:
              behavior.reason ?? "AI_UNAVAILABLE",
            detail:
              behavior.detail ??
              "Offline stub intentionally unavailable.",
          };

        case "hang_until_abort": {
          await new Promise<void>(
            (resolve) => {
              if (
                generateOptions.signal.aborted
              ) {
                resolve();
                return;
              }

              generateOptions.signal.addEventListener(
                "abort",
                () => resolve(),
                {
                  once: true,
                },
              );
            },
          );

          return {
            ok: false,
            reason: "AI_TIMEOUT",
            detail:
              "Offline stub hung until abort.",
          };
        }

        case "ignore_abort_late": {
          const waitMs =
            behavior.delayMs ??
            generateOptions.timeoutMs + 500;

          // Intentionally ignore AbortSignal.
          await delay(
            waitMs,
          );

          return {
            ok: true,
            candidate: buildValidLookingCandidate(
              envelope,
              options,
            ),
          };
        }

        case "hash_mismatch": {
          const candidate =
            buildValidLookingCandidate(
              envelope,
              options,
            );

          return {
            ok: true,
            candidate: {
              ...candidate,
              groundingHash:
                "sha256:0000000000000000000000000000000000000000000000000000000000000000",
            },
          };
        }

        case "unsupported_shape":
          return {
            ok: true,
            candidate: {
              schemaVersion:
                AI_EXPLANATION_ADAPTER_CONTRACT_VERSION,
              adapterId: "offline_stub",
              provider: "stub",
              model: "stub-v1",
              promptVersion:
                envelope.request.promptVersion,
              semanticProfileVersion:
                AI_BRIEF_SEMANTIC_CLAIMS_VERSION,
              groundingHash: envelope.groundingHash,
              prose: {
                whyNowSummary: "",
                uncertaintySummary: "",
                nextStepSummary: "",
              },
              claims: [],
            },
          };

        case "rejected_claims": {
          const candidate =
            buildValidLookingCandidate(
              envelope,
              options,
            );
          const mutatedActionType =
            envelope.grounding.actionType ===
              "PROMOTE"
              ? "REORDER"
              : "PROMOTE";

          return {
            ok: true,
            candidate: {
              ...candidate,
              claims: [
                {
                  claimId: "mutated-action",
                  kind: "action_type",
                  text: `Forced ${mutatedActionType}`,
                  structured: {
                    actionType:
                      mutatedActionType,
                  },
                  evidenceRefs: [
                    "availableQuantity",
                  ],
                },
              ],
            },
          };
        }

        case "malformed_nested_claims": {
          const candidate =
            buildValidLookingCandidate(
              envelope,
              options,
            );

          return {
            ok: true,
            candidate: {
              ...candidate,
              claims: [
                {
                  claimId: "malformed",
                  kind: "why_now_statement",
                  // Intentionally invalid runtime shape for nesting guards.
                  text: null as unknown as string,
                  evidenceRefs: "availableQuantity" as unknown as string[],
                  structured: {
                    reasonCodes: "not-an-array" as unknown as string[],
                  },
                },
              ],
            },
          };
        }

        case "custom":
          return {
            ok: true,
            candidate: behavior.candidate,
          };

        case "valid_looking":
          return {
            ok: true,
            candidate: buildValidLookingCandidate(
              envelope,
              options,
            ),
          };

        default: {
          const _exhaustive: never =
            behavior;
          return _exhaustive;
        }
      }
    },
  };
}
