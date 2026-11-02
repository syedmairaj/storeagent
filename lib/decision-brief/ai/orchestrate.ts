/**
 * M7.4e E3.3 — fail-closed AI explanation orchestrator.
 *
 * - disabled_default / not allowlisted → E1 fallback with E2 parity
 * - test_injected or server_resolved_config may attempt AI
 * - forceDeterministicFallback=true → never ai_validated (E3.1/E3.2)
 * - forceDeterministicFallback=false under authorized conjunction →
 *   may deliver ai_validated after full validation
 * - Timeout / cost / late-result → fallback; late successes discarded
 * - Client/model enablement pretenders are never consulted here
 */

import type {
  OrganizationMemberRole,
} from "@/lib/commerce-domain/types";

import {
  buildDeterministicFallbackBrief,
} from "@/lib/decision-brief/fallback-brief";

import {
  validateGrounding,
} from "@/lib/decision-brief/validate-grounding";

import {
  buildDeterministicGroundingEnvelope,
} from "@/lib/decision-brief/ai/envelope";

import {
  mergeAiValidatedBrief,
  withRejectedUsedFallback,
} from "@/lib/decision-brief/ai/merge-ai-brief";

import {
  validateAiExplanationCandidate,
} from "@/lib/decision-brief/ai/validate-candidate";

import {
  AI_EXPLANATION_DEFAULT_MAX_INPUT_TOKENS,
  AI_EXPLANATION_DEFAULT_MAX_OUTPUT_TOKENS,
  AI_EXPLANATION_DEFAULT_TIMEOUT_MS,
  E3_1_FORCE_DETERMINISTIC_FALLBACK,
  type AiExplanationAdapter,
  type AiExplanationAdapterFailureReason,
  type AiExplanationAdapterResult,
  type AiExplanationCandidateV1,
  type DeterministicGroundingEnvelope,
  type ExplainDecisionBriefDiagnostics,
  type ExplainDecisionBriefOptions,
  type ExplainDecisionBriefResult,
} from "@/lib/decision-brief/ai/types";

import type {
  DecisionBriefGroundingInput,
  DecisionBriefRejectionCode,
  DecisionBriefV1,
} from "@/lib/decision-brief/types";

type AdapterRaceOutcome =
  | {
      kind: "deadline";
    }
  | {
      kind: "result";
      result: AiExplanationAdapterResult;
    }
  | {
      kind: "throw";
      detail: string;
    };

function emptyDiagnostics(
  options: ExplainDecisionBriefOptions,
): ExplainDecisionBriefDiagnostics {
  return {
    aiAttempted: false,
    enablementSource: options.enablementSource,
    forceDeterministicFallback:
      options.forceDeterministicFallback === true,
    candidateReceived: false,
    candidateDiscarded: false,
    discardReasons: [],
    lateResultDiscarded: false,
  };
}

function mayAttemptAi(
  options: ExplainDecisionBriefOptions,
): boolean {
  if (
    options.aiExplanationEnabled !== true ||
    options.allowlistMatch !== true
  ) {
    return false;
  }

  if (
    options.enablementSource !== "test_injected" &&
    options.enablementSource !== "server_resolved_config"
  ) {
    return false;
  }

  if (
    !options.adapter
  ) {
    return false;
  }

  if (
    options.adapter.supportsLiveNetwork !== false
  ) {
    return false;
  }

  if (
    options.adapter.adapterId === "live_provider"
  ) {
    return false;
  }

  if (
    options.adapter.adapterId !== "offline_stub" &&
    options.adapter.adapterId !== "recorded_replay"
  ) {
    return false;
  }

  return true;
}

function estimateTokensFromText(
  text: string,
): number {
  // Rough deterministic budget proxy — not a provider tokenizer.
  return Math.ceil(
    text.length / 4,
  );
}

function estimateEnvelopeInputTokens(
  envelope: DeterministicGroundingEnvelope,
): number {
  return estimateTokensFromText(
    JSON.stringify({
      groundingHash: envelope.groundingHash,
      actionType: envelope.grounding.actionType,
      productTitle: envelope.grounding.productTitle,
      reasonCodes: envelope.grounding.reasonCodes,
      promptVersion: envelope.request.promptVersion,
    }),
  );
}

function estimateCandidateOutputTokens(
  candidate: AiExplanationCandidateV1,
): number {
  const fromProse =
    estimateTokensFromText(
      [
        candidate.prose.whyNowSummary,
        candidate.prose.uncertaintySummary,
        candidate.prose.nextStepSummary,
      ].join("\n"),
    );

  const fromUsage =
    typeof candidate.usage?.outputTokenEstimate === "number"
      ? candidate.usage.outputTokenEstimate
      : 0;

  // Use the stricter of declared usage vs prose length so stubs cannot
  // under-report (e.g. outputTokenEstimate: 0) to bypass cost caps.
  return Math.max(
    fromUsage,
    fromProse,
  );
}

async function raceAdapterWithDeadline(
  adapter: AiExplanationAdapter,
  envelope: DeterministicGroundingEnvelope,
  timeoutMs: number,
  maxInputTokens: number,
  maxOutputTokens: number,
): Promise<{
  outcome: AdapterRaceOutcome;
  lateResultDiscarded: boolean;
}> {
  const controller =
    new AbortController();

  let deadlineFired =
    false;
  let deadlineTimer:
    ReturnType<typeof setTimeout> |
    undefined;

  const adapterPromise: Promise<AdapterRaceOutcome> =
    adapter
      .generate(
        envelope,
        {
          signal: controller.signal,
          timeoutMs,
          maxInputTokens,
          maxOutputTokens,
        },
      )
      .then(
        (result): AdapterRaceOutcome => ({
          kind: "result",
          result,
        }),
      )
      .catch(
        (error: unknown): AdapterRaceOutcome => ({
          kind: "throw",
          detail:
            error instanceof Error
              ? error.message
              : "Adapter threw.",
        }),
      );

  const deadlinePromise =
    new Promise<AdapterRaceOutcome>(
      (resolve) => {
        deadlineTimer =
          setTimeout(
            () => {
              deadlineFired = true;
              controller.abort();
              resolve({
                kind: "deadline",
              });
            },
            timeoutMs,
          );
      },
    );

  const outcome =
    await Promise.race([
      adapterPromise,
      deadlinePromise,
    ]);

  if (
    deadlineTimer !== undefined
  ) {
    clearTimeout(
      deadlineTimer,
    );
  }

  if (
    outcome.kind === "deadline"
  ) {
    void adapterPromise.then(
      () => undefined,
      () => undefined,
    );

    return {
      outcome,
      lateResultDiscarded: true,
    };
  }

  return {
    outcome,
    lateResultDiscarded: deadlineFired,
  };
}

function buildFallbackBrief(
  grounding: DecisionBriefGroundingInput,
  options: {
    briefId: string;
    role: OrganizationMemberRole;
    generatedAt?: string;
  },
):
  | {
      ok: true;
      brief: DecisionBriefV1;
    }
  | {
      ok: false;
      reasons: readonly DecisionBriefRejectionCode[];
      detail: string;
    } {
  return buildDeterministicFallbackBrief(
    grounding,
    {
      briefId: options.briefId,
      role: options.role,
      generatedAt: options.generatedAt,
    },
  );
}

function fallbackResult(
  grounding: DecisionBriefGroundingInput,
  options: {
    briefId: string;
    role: OrganizationMemberRole;
    generatedAt?: string;
  },
  diagnostics: ExplainDecisionBriefDiagnostics,
  rejectedChrome: boolean,
): ExplainDecisionBriefResult {
  const built =
    buildFallbackBrief(
      grounding,
      options,
    );

  if (
    !built.ok
  ) {
    return {
      ok: false,
      reasons: built.reasons,
      detail: built.detail,
      diagnostics,
    };
  }

  // rejected_used_fallback is only for merchant soft-enable attempts that
  // discard after attempting AI. forceDeterministicFallback paths keep E2
  // accepted chrome while still recording discardReasons in diagnostics.
  const brief =
    rejectedChrome &&
    diagnostics.discardReasons.length > 0
      ? withRejectedUsedFallback(
          built.brief,
          diagnostics.discardReasons,
          diagnostics.discardReasons.join(", "),
        )
      : built.brief;

  return {
    ok: true,
    brief,
    diagnostics,
  };
}

function mapAdapterFailureToRejection(
  reason: AiExplanationAdapterFailureReason,
): DecisionBriefRejectionCode {
  switch (
    reason
  ) {
    case "AI_TIMEOUT":
      return "AI_TIMEOUT";
    case "AI_UNSUPPORTED_SHAPE":
      return "AI_UNSUPPORTED_SHAPE";
    case "AI_PROMPT_INJECTION_SUSPECT":
      return "AI_PROMPT_INJECTION_SUSPECT";
    case "GROUNDING_HASH_MISMATCH":
      return "CLAIM_EVIDENCE_UNTRACED";
    case "COST_CAP_EXCEEDED":
    case "AI_UNAVAILABLE":
      return "AI_UNAVAILABLE";
    default: {
      const _exhaustive: never =
        reason;
      return _exhaustive;
    }
  }
}

/**
 * Explain a Decision Brief from validated grounding.
 */
export async function explainDecisionBriefFromGrounding(
  grounding: DecisionBriefGroundingInput,
  options: ExplainDecisionBriefOptions,
): Promise<ExplainDecisionBriefResult> {
  const diagnostics =
    emptyDiagnostics(
      options,
    );

  const forceFallback =
    options.forceDeterministicFallback === true;

  if (
    grounding.briefMode !== "synthetic_demo"
  ) {
    return {
      ok: false,
      reasons: [
        "INVALID_BRIEF_MODE",
      ],
      detail:
        "engine_bound Decision Brief composition is not authorized until E4.",
      diagnostics,
    };
  }

  const groundingValidation =
    validateGrounding(
      grounding,
    );

  if (
    !groundingValidation.ok
  ) {
    return {
      ok: false,
      reasons: groundingValidation.reasons,
      detail: groundingValidation.detail,
      diagnostics,
    };
  }

  if (
    !mayAttemptAi(
      options,
    )
  ) {
    // Flag OFF / not allowlisted / wrong source → exact E2 fallback chrome.
    return fallbackResult(
      grounding,
      options,
      diagnostics,
      false,
    );
  }

  const adapter =
    options.adapter as AiExplanationAdapter;

  // Soft-enable merchant chrome only when forceDeterministicFallback is lifted.
  const softEnableDelivery =
    !forceFallback;

  diagnostics.aiAttempted = true;

  let envelope: DeterministicGroundingEnvelope;

  try {
    envelope =
      buildDeterministicGroundingEnvelope(
        grounding,
        {
          briefId: options.briefId,
          promptVersion: options.promptVersion,
        },
      );
  } catch {
    diagnostics.candidateDiscarded = true;
    diagnostics.discardReasons = [
      "AI_UNAVAILABLE",
    ];

    return fallbackResult(
      grounding,
      options,
      diagnostics,
      softEnableDelivery,
    );
  }

  diagnostics.groundingHash =
    envelope.groundingHash;

  const timeoutMs =
    options.timeoutMs ??
    AI_EXPLANATION_DEFAULT_TIMEOUT_MS;
  const maxInputTokens =
    options.maxInputTokens ??
    AI_EXPLANATION_DEFAULT_MAX_INPUT_TOKENS;
  const maxOutputTokens =
    options.maxOutputTokens ??
    AI_EXPLANATION_DEFAULT_MAX_OUTPUT_TOKENS;

  const inputEstimate =
    estimateEnvelopeInputTokens(
      envelope,
    );

  if (
    inputEstimate > maxInputTokens
  ) {
    diagnostics.candidateDiscarded = true;
    diagnostics.costCapExceeded = true;
    diagnostics.adapterFailureReason =
      "COST_CAP_EXCEEDED";
    diagnostics.discardReasons = [
      "AI_UNAVAILABLE",
    ];

    return fallbackResult(
      grounding,
      options,
      diagnostics,
      softEnableDelivery,
    );
  }

  const {
    outcome,
    lateResultDiscarded,
  } =
    await raceAdapterWithDeadline(
      adapter,
      envelope,
      timeoutMs,
      maxInputTokens,
      maxOutputTokens,
    );

  diagnostics.lateResultDiscarded =
    lateResultDiscarded;

  if (
    outcome.kind === "deadline"
  ) {
    diagnostics.candidateDiscarded = true;
    diagnostics.adapterFailureReason = "AI_TIMEOUT";
    diagnostics.discardReasons = [
      "AI_TIMEOUT",
    ];

    return fallbackResult(
      grounding,
      options,
      diagnostics,
      softEnableDelivery,
    );
  }

  if (
    outcome.kind === "throw"
  ) {
    diagnostics.candidateDiscarded = true;
    diagnostics.adapterFailureReason =
      "AI_UNAVAILABLE";
    diagnostics.discardReasons = [
      "AI_UNAVAILABLE",
    ];

    return fallbackResult(
      grounding,
      options,
      diagnostics,
      softEnableDelivery,
    );
  }

  const adapterResult =
    outcome.result;

  if (
    !adapterResult.ok
  ) {
    diagnostics.candidateDiscarded = true;
    diagnostics.adapterFailureReason =
      adapterResult.reason;
    diagnostics.costCapExceeded =
      adapterResult.reason === "COST_CAP_EXCEEDED";
    diagnostics.discardReasons = [
      mapAdapterFailureToRejection(
        adapterResult.reason,
      ),
    ];

    return fallbackResult(
      grounding,
      options,
      diagnostics,
      softEnableDelivery,
    );
  }

  diagnostics.candidateReceived = true;

  const outputEstimate =
    estimateCandidateOutputTokens(
      adapterResult.candidate,
    );

  if (
    outputEstimate > maxOutputTokens ||
    (
      typeof adapterResult.candidate.usage?.inputTokenEstimate === "number" &&
      adapterResult.candidate.usage.inputTokenEstimate > maxInputTokens
    )
  ) {
    diagnostics.candidateDiscarded = true;
    diagnostics.costCapExceeded = true;
    diagnostics.adapterFailureReason =
      "COST_CAP_EXCEEDED";
    diagnostics.discardReasons = [
      "AI_UNAVAILABLE",
    ];

    return fallbackResult(
      grounding,
      options,
      diagnostics,
      softEnableDelivery,
    );
  }

  let validation;

  try {
    validation =
      validateAiExplanationCandidate(
        envelope,
        adapterResult.candidate,
      );
  } catch {
    diagnostics.candidateDiscarded = true;
    diagnostics.adapterFailureReason =
      "AI_UNSUPPORTED_SHAPE";
    diagnostics.discardReasons = [
      "AI_UNSUPPORTED_SHAPE",
    ];

    return fallbackResult(
      grounding,
      options,
      diagnostics,
      softEnableDelivery,
    );
  }

  if (
    !validation.ok
  ) {
    diagnostics.candidateDiscarded = true;
    diagnostics.discardReasons = [
      ...validation.reasons,
    ];

    if (
      validation.adapterReason
    ) {
      diagnostics.adapterFailureReason =
        validation.adapterReason;
    }

    return fallbackResult(
      grounding,
      options,
      diagnostics,
      softEnableDelivery,
    );
  }

  // Validation passed.
  if (
    forceFallback
  ) {
    // E3.1/E3.2: discard after successful validation exercise.
    diagnostics.candidateDiscarded = true;
    diagnostics.discardReasons = [];

    return fallbackResult(
      grounding,
      options,
      diagnostics,
      false,
    );
  }

  // E3.3 delivery conjunction: merge only the minted validated candidate.
  const merged =
    mergeAiValidatedBrief(
      grounding,
      validation.validatedCandidate,
      {
        briefId: options.briefId,
        role: options.role,
        generatedAt: options.generatedAt,
      },
    );

  if (
    !merged.ok
  ) {
    diagnostics.candidateDiscarded = true;
    diagnostics.discardReasons = [
      ...merged.reasons,
    ];

    return fallbackResult(
      grounding,
      options,
      diagnostics,
      true,
    );
  }

  diagnostics.candidateDiscarded = false;

  return {
    ok: true,
    brief: merged.brief,
    diagnostics,
  };
}

/**
 * Disabled-default options helper for product / demo paths.
 */
export function disabledAiExplanationOptions(
  input: {
    briefId: string;
    role: OrganizationMemberRole;
    generatedAt?: string;
  },
): ExplainDecisionBriefOptions {
  return {
    briefId: input.briefId,
    role: input.role,
    generatedAt: input.generatedAt,
    aiExplanationEnabled: false,
    allowlistMatch: false,
    enablementSource: "disabled_default",
    forceDeterministicFallback:
      E3_1_FORCE_DETERMINISTIC_FALLBACK,
  };
}

/**
 * Test-only enablement helper. Defaults to forceDeterministicFallback=true
 * (E3.1/E3.2). Pass false only in E3.3 harnesses that assert ai_validated.
 */
export function testInjectedAiExplanationOptions(
  input: {
    briefId: string;
    role: OrganizationMemberRole;
    generatedAt?: string;
    adapter: AiExplanationAdapter;
    timeoutMs?: number;
    maxInputTokens?: number;
    maxOutputTokens?: number;
    promptVersion?: string;
    forceDeterministicFallback?: boolean;
  },
): ExplainDecisionBriefOptions {
  return {
    briefId: input.briefId,
    role: input.role,
    generatedAt: input.generatedAt,
    aiExplanationEnabled: true,
    allowlistMatch: true,
    enablementSource: "test_injected",
    adapter: input.adapter,
    timeoutMs: input.timeoutMs,
    maxInputTokens: input.maxInputTokens,
    maxOutputTokens: input.maxOutputTokens,
    promptVersion: input.promptVersion,
    forceDeterministicFallback:
      input.forceDeterministicFallback ??
      E3_1_FORCE_DETERMINISTIC_FALLBACK,
  };
}

/**
 * Trusted server-resolved soft-enable options (E3.3 product path).
 * Callers must obtain enablement from resolveServerAiExplanationEnablement.
 */
export function serverResolvedAiExplanationOptions(
  input: {
    briefId: string;
    role: OrganizationMemberRole;
    generatedAt?: string;
    adapter: AiExplanationAdapter;
    aiExplanationEnabled: boolean;
    allowlistMatch: boolean;
    timeoutMs?: number;
    maxInputTokens?: number;
    maxOutputTokens?: number;
    promptVersion?: string;
  },
): ExplainDecisionBriefOptions {
  const softEnabled =
    input.aiExplanationEnabled === true &&
    input.allowlistMatch === true;

  return {
    briefId: input.briefId,
    role: input.role,
    generatedAt: input.generatedAt,
    aiExplanationEnabled: input.aiExplanationEnabled,
    allowlistMatch: input.allowlistMatch,
    enablementSource: softEnabled
      ? "server_resolved_config"
      : (
          input.aiExplanationEnabled ||
          input.allowlistMatch
            ? "server_resolved_config"
            : "disabled_default"
        ),
    adapter: softEnabled ? input.adapter : undefined,
    timeoutMs: input.timeoutMs,
    maxInputTokens: input.maxInputTokens,
    maxOutputTokens: input.maxOutputTokens,
    promptVersion: input.promptVersion,
    forceDeterministicFallback: !softEnabled,
  };
}
