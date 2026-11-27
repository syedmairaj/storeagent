/**
 * AI-ARCH-1d — apply validated drafts or fall back to deterministic answers.
 * Never passes unvalidated AI output to merchants.
 */

import type {
  AgentAnswer,
  AgentAbstention,
  AgentTrace,
  CommerceAgentEvidenceBundle,
  MerchantContext,
} from "@/lib/commerce-agent/types";
import { abstain } from "@/lib/commerce-agent/orchestrator/assemble";
import { validateCommerceAgentAnswerDraft } from "@/lib/commerce-agent/validation/validate-draft";
import {
  assertLiveProviderForbidden,
} from "@/lib/commerce-agent/validation/offline-stub";
import type {
  CommerceAgentAnswerDraft,
  CommerceAgentDraftAdapter,
  CommerceAgentDraftRejectionCode,
} from "@/lib/commerce-agent/validation/types";

export type ApplyValidatedDraftResult =
  | {
      status: "accepted";
      answer: AgentAnswer;
      draft: CommerceAgentAnswerDraft;
    }
  | {
      status: "rejected_fallback";
      answer: AgentAnswer;
      reasons: readonly CommerceAgentDraftRejectionCode[];
      detail: string;
    }
  | {
      status: "rejected_abstain";
      abstention: AgentAbstention;
      reasons: readonly CommerceAgentDraftRejectionCode[];
      detail: string;
    };

function appendTraceNote(
  trace: AgentTrace,
  note: string,
  ok: boolean,
): AgentTrace {
  return {
    ...trace,
    steps: [
      ...trace.steps,
      {
        step: trace.steps.length + 1,
        kind: "verify",
        ok,
        note,
      },
    ],
    endedAt: new Date().toISOString(),
  };
}

/**
 * Accept a draft only after validation; otherwise return deterministic baseline.
 */
export function applyValidatedCommerceAgentDraft(input: {
  draft: CommerceAgentAnswerDraft;
  bundle: CommerceAgentEvidenceBundle;
  context: MerchantContext;
  baseline: AgentAnswer;
}): ApplyValidatedDraftResult {
  const validation = validateCommerceAgentAnswerDraft(input);
  if (!validation.ok) {
    return {
      status: "rejected_fallback",
      answer: {
        ...input.baseline,
        generator: "fallback_deterministic",
        trace: appendTraceNote(
          input.baseline.trace,
          `draft_rejected:${validation.reasons.join(",")}`,
          false,
        ),
      },
      reasons: validation.reasons,
      detail: validation.detail,
    };
  }

  const draft = input.draft;
  const nextSteps =
    draft.suggestedNextStepCodes && draft.suggestedNextStepCodes.length > 0
      ? input.bundle.nextSteps.filter((step) =>
          draft.suggestedNextStepCodes!.includes(step.code),
        )
      : input.baseline.nextSteps;

  const recommendedAction =
    draft.recommendedAction ?? input.baseline.recommendedAction;

  return {
    status: "accepted",
    draft,
    answer: {
      ...input.baseline,
      merchantAnswer: draft.merchantAnswer.trim(),
      recommendedAction,
      nextSteps: nextSteps.length > 0 ? nextSteps : input.baseline.nextSteps,
      approvalBoundary: recommendedAction.approvalBoundary,
      // Authoritative facts stay from baseline — draft cannot add/remove them.
      findings: input.baseline.findings,
      evidence: input.baseline.evidence,
      calculations: input.baseline.calculations,
      uncertainty: input.baseline.uncertainty,
      evidenceHash: input.baseline.evidenceHash,
      generator: "ai_validated",
      trace: appendTraceNote(
        {
          ...input.baseline.trace,
          tokenEstimateIn: draft.usage?.inputTokenEstimate,
          tokenEstimateOut: draft.usage?.outputTokenEstimate,
        },
        "draft_accepted:ai_validated",
        true,
      ),
    },
  };
}

export type PolishCommerceAgentAnswerResult =
  | { status: "answered"; answer: AgentAnswer }
  | { status: "abstained"; abstention: AgentAbstention };

/**
 * Optional polish path: generate draft via injectable stub → validate → accept or fallback.
 * Live providers are rejected closed. Stub timeout/error → deterministic fallback.
 */
export async function polishCommerceAgentAnswer(input: {
  baseline: AgentAnswer;
  bundle: CommerceAgentEvidenceBundle;
  context: MerchantContext;
  adapter: CommerceAgentDraftAdapter;
  timeoutMs?: number;
  maxInputTokens?: number;
  maxOutputTokens?: number;
}): Promise<PolishCommerceAgentAnswerResult> {
  const {
    baseline,
    bundle,
    context,
    adapter,
    timeoutMs = 1500,
    maxInputTokens = 4000,
    maxOutputTokens = 800,
  } = input;

  if (assertLiveProviderForbidden(adapter)) {
    return {
      status: "answered",
      answer: {
        ...baseline,
        generator: "fallback_deterministic",
        trace: appendTraceNote(
          baseline.trace,
          "draft_rejected:LIVE_PROVIDER_FORBIDDEN",
          false,
        ),
      },
    };
  }

  if (adapter.supportsLiveNetwork) {
    return {
      status: "answered",
      answer: {
        ...baseline,
        generator: "fallback_deterministic",
        trace: appendTraceNote(
          baseline.trace,
          "draft_rejected:LIVE_PROVIDER_FORBIDDEN",
          false,
        ),
      },
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let adapterResult: Awaited<ReturnType<CommerceAgentDraftAdapter["generate"]>>;
  try {
    adapterResult = await Promise.race([
      adapter.generate(
        {
          evidenceHash: bundle.evidenceHash,
          merchantAnswerBaseline: baseline.merchantAnswer,
          allowlistedLiterals: bundle.allowlistedLiterals,
          evidenceIds: bundle.evidence.map((e) => e.evidenceId),
          claimIds: [
            ...bundle.findings.map((c) => c.claimId),
            ...bundle.hypotheses.map((c) => c.claimId),
          ],
          nextStepCodes: bundle.nextSteps.map((s) => s.code),
          recommendedAction: baseline.recommendedAction,
        },
        {
          signal: controller.signal,
          maxInputTokens,
          maxOutputTokens,
          timeoutMs,
        },
      ),
      new Promise<never>((_, reject) => {
        controller.signal.addEventListener(
          "abort",
          () => reject(new Error("aborted")),
          { once: true },
        );
      }),
    ]);
  } catch {
    clearTimeout(timer);
    return {
      status: "answered",
      answer: {
        ...baseline,
        generator: "fallback_deterministic",
        trace: appendTraceNote(baseline.trace, "draft_rejected:AI_TIMEOUT", false),
      },
    };
  } finally {
    clearTimeout(timer);
  }

  if (!adapterResult.ok) {
    return {
      status: "answered",
      answer: {
        ...baseline,
        generator: "fallback_deterministic",
        trace: appendTraceNote(
          baseline.trace,
          `draft_adapter_failed:${adapterResult.reason}`,
          false,
        ),
      },
    };
  }

  const applied = applyValidatedCommerceAgentDraft({
    draft: adapterResult.draft,
    bundle,
    context,
    baseline,
  });

  if (applied.status === "accepted" || applied.status === "rejected_fallback") {
    return { status: "answered", answer: applied.answer };
  }

  return { status: "abstained", abstention: applied.abstention };
}

/**
 * When there is no deterministic baseline (should be rare), abstain instead of
 * forwarding an unvalidated draft.
 */
export function abstainWhenNoDeterministicBaseline(input: {
  reasons: readonly CommerceAgentDraftRejectionCode[];
  detail: string;
  trace: AgentTrace;
  evidenceHash?: string;
}): AgentAbstention {
  return abstain({
    code: "UNSUPPORTED_EVIDENCE",
    merchantMessage:
      "I could not safely validate an AI draft and have no deterministic baseline to show.",
    evidenceHash: input.evidenceHash,
    trace: appendTraceNote(
      input.trace,
      `draft_abstain:${input.reasons.join(",")}:${input.detail.slice(0, 80)}`,
      false,
    ),
  });
}
