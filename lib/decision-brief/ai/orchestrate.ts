/**
 * M7.4e E3.1 — fail-closed AI explanation orchestrator (fallback-only).
 *
 * - Defaults / disabled_default → E1 fallback with E2 parity
 * - Test-injected enablement only for AI attempt in E3.1
 * - forceDeterministicFallback always true → never ai_validated
 * - Orchestrator-owned deadline; late / ignore-abort results discarded
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
  validateAiExplanationCandidate,
} from "@/lib/decision-brief/ai/validate-candidate";

import {
  AI_EXPLANATION_DEFAULT_TIMEOUT_MS,
  E3_1_FORCE_DETERMINISTIC_FALLBACK,
  type AiExplanationAdapter,
  type AiExplanationAdapterFailureReason,
  type AiExplanationAdapterResult,
  type ExplainDecisionBriefDiagnostics,
  type ExplainDecisionBriefOptions,
  type ExplainDecisionBriefResult,
} from "@/lib/decision-brief/ai/types";

import type {
  DecisionBriefGroundingInput,
  DecisionBriefRejectionCode,
} from "@/lib/decision-brief/types";

const DEFAULT_MAX_INPUT_TOKENS =
  2048;
const DEFAULT_MAX_OUTPUT_TOKENS =
  512;

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
  enablementSource: ExplainDecisionBriefOptions["enablementSource"],
): ExplainDecisionBriefDiagnostics {
  return {
    aiAttempted: false,
    enablementSource,
    forceDeterministicFallback:
      E3_1_FORCE_DETERMINISTIC_FALLBACK,
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

  // E3.1: test_injected only. server_resolved_config is E3.3+.
  // disabled_default never attempts.
  if (
    options.enablementSource !== "test_injected"
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

  return true;
}

async function raceAdapterWithDeadline(
  adapter: AiExplanationAdapter,
  envelope: ReturnType<
    typeof buildDeterministicGroundingEnvelope
  >,
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

  // Always clear on early adapter settlement so a late timer cannot
  // abort after success or leave dangling deadline work. Timeout,
  // AbortSignal, and late-result discard paths are otherwise unchanged.
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
    // Swallow late adapter settlement; never merge into delivery.
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

function fallbackResult(
  grounding: DecisionBriefGroundingInput,
  options: {
    briefId: string;
    role: OrganizationMemberRole;
    generatedAt?: string;
  },
  diagnostics: ExplainDecisionBriefDiagnostics,
): ExplainDecisionBriefResult {
  const built =
    buildDeterministicFallbackBrief(
      grounding,
      {
        briefId: options.briefId,
        role: options.role,
        generatedAt: options.generatedAt,
      },
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

  return {
    ok: true,
    brief: built.brief,
    diagnostics,
  };
}

/**
 * Explain a Decision Brief from validated grounding.
 *
 * E3.1 ALWAYS returns deterministic_fallback on success paths
 * (forceDeterministicFallback). Never returns generator=ai_validated.
 */
export async function explainDecisionBriefFromGrounding(
  grounding: DecisionBriefGroundingInput,
  options: ExplainDecisionBriefOptions,
): Promise<ExplainDecisionBriefResult> {
  const diagnostics =
    emptyDiagnostics(
      options.enablementSource,
    );

  // E3.1 hard freeze — ignore any attempt to disable force-fallback.
  if (
    options.forceDeterministicFallback !== true
  ) {
    // Still deliver fallback; record that an illegal delivery request was ignored.
    diagnostics.candidateDiscarded = true;
    diagnostics.discardReasons = [
      "AI_PROSE_SEMANTIC_VALIDATION_REQUIRED",
    ];
  }

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

  // Flag OFF / not allowlisted / wrong enablement source → E2-identical fallback.
  if (
    !mayAttemptAi(
      options,
    )
  ) {
    return fallbackResult(
      grounding,
      options,
      diagnostics,
    );
  }

  const adapter =
    options.adapter as AiExplanationAdapter;

  diagnostics.aiAttempted = true;

  let envelope;

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
    );
  }

  diagnostics.groundingHash =
    envelope.groundingHash;

  const timeoutMs =
    options.timeoutMs ??
    AI_EXPLANATION_DEFAULT_TIMEOUT_MS;
  const maxInputTokens =
    options.maxInputTokens ??
    DEFAULT_MAX_INPUT_TOKENS;
  const maxOutputTokens =
    options.maxOutputTokens ??
    DEFAULT_MAX_OUTPUT_TOKENS;

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
    diagnostics.discardReasons = [
      mapAdapterFailureToRejection(
        adapterResult.reason,
      ),
    ];

    return fallbackResult(
      grounding,
      options,
      diagnostics,
    );
  }

  diagnostics.candidateReceived = true;

  // E3.1: ALWAYS discard candidate after optional validation exercise.
  diagnostics.candidateDiscarded = true;

  let validation;

  try {
    validation =
      validateAiExplanationCandidate(
        envelope,
        adapterResult.candidate,
      );
  } catch {
    diagnostics.adapterFailureReason =
      "AI_UNSUPPORTED_SHAPE";
    diagnostics.discardReasons = [
      "AI_UNSUPPORTED_SHAPE",
    ];

    return fallbackResult(
      grounding,
      options,
      diagnostics,
    );
  }

  if (
    !validation.ok
  ) {
    diagnostics.discardReasons = [
      ...validation.reasons,
    ];

    if (
      validation.adapterReason
    ) {
      diagnostics.adapterFailureReason =
        validation.adapterReason;
    }
  } else {
    // Candidate passed structured + semantic gates but E3.2 merchant
    // delivery remains force-fallback (never ai_validated).
    diagnostics.discardReasons = [];
  }

  return fallbackResult(
    grounding,
    options,
    diagnostics,
  );
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
 * Disabled-default options helper for product / demo paths.
 * Never enables AI; always forceDeterministicFallback.
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
 * Test-only enablement helper. Must not be used from product UI paths.
 */
export function testInjectedAiExplanationOptions(
  input: {
    briefId: string;
    role: OrganizationMemberRole;
    generatedAt?: string;
    adapter: AiExplanationAdapter;
    timeoutMs?: number;
    promptVersion?: string;
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
    promptVersion: input.promptVersion,
    forceDeterministicFallback:
      E3_1_FORCE_DETERMINISTIC_FALLBACK,
  };
}
