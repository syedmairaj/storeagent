/**
 * AI-INV-1 — fail-closed inventory explainer orchestrator.
 *
 * Flow: evidence → cache → deterministic baseline → optional offline AI polish
 * → validate → reject invented claims → return answer.
 * Live providers are never attempted.
 */

import {
  checkAndConsumeInventoryExplainerBudget,
  estimateTokensFromText,
  getCachedInventoryExplainerAnswer,
  putCachedInventoryExplainerAnswer,
} from "@/lib/inventory-explainer/budget";
import { buildDeterministicInventoryExplainerAnswer } from "@/lib/inventory-explainer/deterministic-answer";
import {
  createInventoryExplainerOfflineStubAdapter,
  type InventoryExplainerAiAdapter,
  type InventoryExplainerAdapterResult,
} from "@/lib/inventory-explainer/ai/offline-stub";
import type {
  ResolvedServerInventoryExplainerEnablement,
} from "@/lib/inventory-explainer/server-enablement";
import {
  INVENTORY_EXPLAINER_DEFAULT_MAX_INPUT_TOKENS,
  INVENTORY_EXPLAINER_DEFAULT_MAX_OUTPUT_TOKENS,
  INVENTORY_EXPLAINER_DEFAULT_TIMEOUT_MS,
  type InventoryExplainerAnswer,
  type InventoryExplainerDiagnostics,
  type InventoryExplainerEnablementSource,
  type InventoryExplainerEvidence,
  type InventoryExplainerQuestionId,
  type InventoryExplainerRejectionCode,
} from "@/lib/inventory-explainer/types";
import { validateInventoryExplainerAiCandidate } from "@/lib/inventory-explainer/validate-answer";

export type ExplainInventorySkuOptions = {
  enablementSource: InventoryExplainerEnablementSource;
  explainerEnabled: boolean;
  allowlistMatch: boolean;
  dailyTokenBudget: number;
  adapter?: InventoryExplainerAiAdapter;
  timeoutMs?: number;
  maxInputTokens?: number;
  maxOutputTokens?: number;
  /** When true, skip AI even if enablement would allow it. */
  forceDeterministic?: boolean;
  skipCache?: boolean;
};

function emptyDiagnostics(
  options: ExplainInventorySkuOptions,
  evidenceHash?: string,
): InventoryExplainerDiagnostics {
  return {
    aiAttempted: false,
    enablementSource: options.enablementSource,
    generator: "deterministic",
    candidateReceived: false,
    candidateDiscarded: false,
    discardReasons: [],
    evidenceHash,
    lateResultDiscarded: false,
  };
}

function mayAttemptAi(options: ExplainInventorySkuOptions): boolean {
  if (options.forceDeterministic === true) {
    return false;
  }
  if (options.explainerEnabled !== true || options.allowlistMatch !== true) {
    return false;
  }
  if (
    options.enablementSource !== "test_injected" &&
    options.enablementSource !== "server_resolved_config"
  ) {
    return false;
  }
  if (!options.adapter) {
    return false;
  }
  if (options.adapter.supportsLiveNetwork !== false) {
    return false;
  }
  if (options.adapter.adapterId === "live_provider") {
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

type RaceOutcome =
  | { kind: "deadline" }
  | { kind: "result"; result: InventoryExplainerAdapterResult }
  | { kind: "throw"; detail: string };

async function raceAdapter(input: {
  adapter: InventoryExplainerAiAdapter;
  evidence: InventoryExplainerEvidence;
  questionId: InventoryExplainerQuestionId;
  timeoutMs: number;
  maxInputTokens: number;
  maxOutputTokens: number;
}): Promise<{ outcome: RaceOutcome; lateResultDiscarded: boolean }> {
  const controller = new AbortController();
  let deadlineFired = false;
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;

  const adapterPromise: Promise<RaceOutcome> = input.adapter
    .generate(
      { evidence: input.evidence, questionId: input.questionId },
      {
        signal: controller.signal,
        timeoutMs: input.timeoutMs,
        maxInputTokens: input.maxInputTokens,
        maxOutputTokens: input.maxOutputTokens,
      },
    )
    .then((result): RaceOutcome => ({ kind: "result", result }))
    .catch(
      (error: unknown): RaceOutcome => ({
        kind: "throw",
        detail: error instanceof Error ? error.message : "Adapter threw.",
      }),
    );

  const deadlinePromise = new Promise<RaceOutcome>((resolve) => {
    deadlineTimer = setTimeout(() => {
      deadlineFired = true;
      controller.abort();
      resolve({ kind: "deadline" });
    }, input.timeoutMs);
  });

  const outcome = await Promise.race([adapterPromise, deadlinePromise]);

  if (deadlineTimer !== undefined) {
    clearTimeout(deadlineTimer);
  }

  if (outcome.kind === "deadline") {
    void adapterPromise.then(
      () => undefined,
      () => undefined,
    );
    return { outcome, lateResultDiscarded: true };
  }

  return { outcome, lateResultDiscarded: deadlineFired };
}

function withDiagnostics(
  answer: InventoryExplainerAnswer,
  diagnostics: InventoryExplainerDiagnostics,
): InventoryExplainerAnswer {
  return {
    ...answer,
    generator: diagnostics.generator,
    diagnostics,
  };
}

function cacheAnswer(
  evidence: InventoryExplainerEvidence,
  questionId: InventoryExplainerQuestionId,
  answer: InventoryExplainerAnswer,
  options: ExplainInventorySkuOptions,
): void {
  if (options.skipCache) {
    return;
  }
  putCachedInventoryExplainerAnswer({
    organizationId: evidence.organizationId,
    grainKey: evidence.grainKey,
    questionId,
    evidenceHash: evidence.evidenceHash,
    answer,
  });
}

function finish(
  evidence: InventoryExplainerEvidence,
  questionId: InventoryExplainerQuestionId,
  answer: InventoryExplainerAnswer,
  options: ExplainInventorySkuOptions,
): InventoryExplainerAnswer {
  cacheAnswer(evidence, questionId, answer, options);
  return answer;
}

/**
 * Explain a SKU question from server-built evidence.
 */
export async function explainInventorySkuFromEvidence(
  evidence: InventoryExplainerEvidence,
  questionId: InventoryExplainerQuestionId,
  options: ExplainInventorySkuOptions,
): Promise<InventoryExplainerAnswer> {
  if (!options.skipCache) {
    const cached = getCachedInventoryExplainerAnswer({
      organizationId: evidence.organizationId,
      grainKey: evidence.grainKey,
      questionId,
      evidenceHash: evidence.evidenceHash,
    });
    if (cached) {
      return cached;
    }
  }

  const deterministic = buildDeterministicInventoryExplainerAnswer(
    evidence,
    questionId,
  );

  const diagnostics = emptyDiagnostics(options, evidence.evidenceHash);

  if (!mayAttemptAi(options)) {
    const answer = withDiagnostics(deterministic, diagnostics);
    cacheAnswer(evidence, questionId, answer, options);
    return answer;
  }

  const adapter = options.adapter as InventoryExplainerAiAdapter;
  diagnostics.aiAttempted = true;

  const inputEstimate = estimateTokensFromText(
    JSON.stringify({
      evidenceHash: evidence.evidenceHash,
      questionId,
      facts: evidence.facts.map((f) => ({ id: f.id, value: f.value })),
      productTitleSafe: evidence.productTitleSafe,
    }),
  );

  const maxInputTokens =
    options.maxInputTokens ?? INVENTORY_EXPLAINER_DEFAULT_MAX_INPUT_TOKENS;
  const maxOutputTokens =
    options.maxOutputTokens ?? INVENTORY_EXPLAINER_DEFAULT_MAX_OUTPUT_TOKENS;
  const timeoutMs = options.timeoutMs ?? INVENTORY_EXPLAINER_DEFAULT_TIMEOUT_MS;

  if (inputEstimate > maxInputTokens) {
    diagnostics.candidateDiscarded = true;
    diagnostics.costCapExceeded = true;
    diagnostics.adapterFailureReason = "COST_CAP_EXCEEDED";
    diagnostics.discardReasons = ["COST_CAP_EXCEEDED"];
    diagnostics.generator = "fallback_deterministic";
    return finish(
      evidence,
      questionId,
      withDiagnostics(deterministic, diagnostics),
      options,
    );
  }

  const budget = checkAndConsumeInventoryExplainerBudget({
    organizationId: evidence.organizationId,
    tokenEstimate: inputEstimate + maxOutputTokens,
    dailyTokenBudget: options.dailyTokenBudget,
  });

  if (!budget.ok) {
    diagnostics.candidateDiscarded = true;
    diagnostics.discardReasons = [budget.reason];
    diagnostics.generator = "fallback_deterministic";
    if (budget.reason === "COST_CAP_EXCEEDED") {
      diagnostics.costCapExceeded = true;
      diagnostics.adapterFailureReason = "COST_CAP_EXCEEDED";
    } else {
      diagnostics.rateLimited = true;
      diagnostics.adapterFailureReason = "RATE_LIMITED";
    }
    return finish(
      evidence,
      questionId,
      withDiagnostics(deterministic, diagnostics),
      options,
    );
  }

  const { outcome, lateResultDiscarded } = await raceAdapter({
    adapter,
    evidence,
    questionId,
    timeoutMs,
    maxInputTokens,
    maxOutputTokens,
  });

  diagnostics.lateResultDiscarded = lateResultDiscarded;

  if (outcome.kind === "deadline") {
    diagnostics.candidateDiscarded = true;
    diagnostics.adapterFailureReason = "AI_TIMEOUT";
    diagnostics.discardReasons = ["AI_TIMEOUT"];
    diagnostics.generator = "fallback_deterministic";
    return finish(
      evidence,
      questionId,
      withDiagnostics(deterministic, diagnostics),
      options,
    );
  }

  if (outcome.kind === "throw") {
    diagnostics.candidateDiscarded = true;
    diagnostics.adapterFailureReason = "AI_UNAVAILABLE";
    diagnostics.discardReasons = ["AI_UNAVAILABLE"];
    diagnostics.generator = "fallback_deterministic";
    return finish(
      evidence,
      questionId,
      withDiagnostics(deterministic, diagnostics),
      options,
    );
  }

  if (!outcome.result.ok) {
    diagnostics.candidateDiscarded = true;
    diagnostics.adapterFailureReason = outcome.result.reason;
    diagnostics.discardReasons = [
      mapAdapterFailure(outcome.result.reason),
    ];
    if (outcome.result.reason === "COST_CAP_EXCEEDED") {
      diagnostics.costCapExceeded = true;
    }
    diagnostics.generator = "fallback_deterministic";
    return finish(
      evidence,
      questionId,
      withDiagnostics(deterministic, diagnostics),
      options,
    );
  }

  diagnostics.candidateReceived = true;
  const candidate = outcome.result.candidate;

  const outputEstimate = Math.max(
    candidate.usage?.outputTokenEstimate ?? 0,
    estimateTokensFromText(candidate.merchantAnswer),
  );

  if (
    outputEstimate > maxOutputTokens ||
    (typeof candidate.usage?.inputTokenEstimate === "number" &&
      candidate.usage.inputTokenEstimate > maxInputTokens)
  ) {
    diagnostics.candidateDiscarded = true;
    diagnostics.costCapExceeded = true;
    diagnostics.adapterFailureReason = "COST_CAP_EXCEEDED";
    diagnostics.discardReasons = ["COST_CAP_EXCEEDED"];
    diagnostics.generator = "fallback_deterministic";
    return finish(
      evidence,
      questionId,
      withDiagnostics(deterministic, diagnostics),
      options,
    );
  }

  const validation = validateInventoryExplainerAiCandidate(evidence, candidate);
  if (!validation.ok) {
    diagnostics.candidateDiscarded = true;
    diagnostics.discardReasons = [...validation.reasons];
    diagnostics.generator = "fallback_deterministic";
    return finish(
      evidence,
      questionId,
      withDiagnostics(deterministic, diagnostics),
      options,
    );
  }

  const nextSteps = evidence.nextSteps.filter((step) =>
    candidate.suggestedNextStepCodes.includes(step.code),
  );
  const citations = evidence.facts
    .filter((f) => candidate.citedFactIds.includes(f.id))
    .map((f) => ({
      factId: f.id,
      label: f.label,
      value: f.value,
      source: f.source,
      asOf: f.asOf ?? null,
    }));

  diagnostics.generator = "ai_validated";
  diagnostics.candidateDiscarded = false;

  const answer: InventoryExplainerAnswer = {
    schemaVersion: deterministic.schemaVersion,
    questionId,
    status: "answered",
    merchantAnswer: candidate.merchantAnswer,
    citations: citations.length > 0 ? citations : deterministic.citations,
    nextSteps: nextSteps.length > 0 ? nextSteps : deterministic.nextSteps,
    evidenceHash: evidence.evidenceHash,
    generator: "ai_validated",
    diagnostics,
  };

  return finish(evidence, questionId, answer, options);
}

function mapAdapterFailure(
  reason: NonNullable<InventoryExplainerDiagnostics["adapterFailureReason"]>,
): InventoryExplainerRejectionCode {
  switch (reason) {
    case "AI_TIMEOUT":
      return "AI_TIMEOUT";
    case "AI_UNSUPPORTED_SHAPE":
      return "AI_UNSUPPORTED_SHAPE";
    case "AI_PROMPT_INJECTION_SUSPECT":
      return "PROMPT_INJECTION_SUSPECT";
    case "GROUNDING_HASH_MISMATCH":
      return "STALE_EVIDENCE";
    case "COST_CAP_EXCEEDED":
      return "COST_CAP_EXCEEDED";
    case "RATE_LIMITED":
      return "RATE_LIMITED";
    case "MALFORMED_OUTPUT":
      return "MALFORMED_OUTPUT";
    case "UNSUPPORTED_CLAIM":
      return "FORBIDDEN_ACTION_CLAIM";
    case "AI_UNAVAILABLE":
    default:
      return "AI_UNAVAILABLE";
  }
}

export function disabledInventoryExplainerOptions(): ExplainInventorySkuOptions {
  return {
    enablementSource: "disabled_default",
    explainerEnabled: false,
    allowlistMatch: false,
    dailyTokenBudget: 50_000,
    forceDeterministic: true,
  };
}

export function testInjectedInventoryExplainerOptions(input: {
  adapter: InventoryExplainerAiAdapter;
  dailyTokenBudget?: number;
  timeoutMs?: number;
  maxInputTokens?: number;
  maxOutputTokens?: number;
  forceDeterministic?: boolean;
  skipCache?: boolean;
}): ExplainInventorySkuOptions {
  return {
    enablementSource: "test_injected",
    explainerEnabled: true,
    allowlistMatch: true,
    dailyTokenBudget: input.dailyTokenBudget ?? 50_000,
    adapter: input.adapter,
    timeoutMs: input.timeoutMs,
    maxInputTokens: input.maxInputTokens,
    maxOutputTokens: input.maxOutputTokens,
    forceDeterministic: input.forceDeterministic ?? false,
    skipCache: input.skipCache ?? true,
  };
}

export function serverResolvedInventoryExplainerOptions(input: {
  enablement: ResolvedServerInventoryExplainerEnablement;
  adapter?: InventoryExplainerAiAdapter;
}): ExplainInventorySkuOptions {
  const soft =
    input.enablement.explainerEnabled === true &&
    input.enablement.allowlistMatch === true;

  return {
    enablementSource: soft
      ? "server_resolved_config"
      : input.enablement.enablementSource,
    explainerEnabled: input.enablement.explainerEnabled,
    allowlistMatch: input.enablement.allowlistMatch,
    dailyTokenBudget: input.enablement.config.dailyTokenBudget,
    adapter: soft
      ? (input.adapter ?? createInventoryExplainerOfflineStubAdapter())
      : undefined,
    forceDeterministic: !soft,
  };
}
