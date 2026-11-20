/**
 * AI-INV-1 — offline_stub adapter. No network. supportsLiveNetwork=false.
 */

import { buildDeterministicInventoryExplainerAnswer } from "@/lib/inventory-explainer/deterministic-answer";
import {
  INVENTORY_EXPLAINER_ANSWER_VERSION,
  INVENTORY_EXPLAINER_PROMPT_VERSION,
  type InventoryExplainerAdapterFailureReason,
  type InventoryExplainerAiCandidate,
  type InventoryExplainerEvidence,
  type InventoryExplainerQuestionId,
} from "@/lib/inventory-explainer/types";

export type InventoryExplainerOfflineStubBehavior =
  | { mode: "echo_deterministic" }
  | { mode: "hallucinate_number" }
  | { mode: "inject_action" }
  | { mode: "hash_mismatch" }
  | { mode: "malformed" }
  | {
      mode: "error";
      reason?: InventoryExplainerAdapterFailureReason;
      detail?: string;
    }
  | { mode: "hang_until_abort" }
  | { mode: "ignore_abort_late"; delayMs?: number }
  | { mode: "custom"; candidate: InventoryExplainerAiCandidate };

export type InventoryExplainerGenerateOptions = {
  signal: AbortSignal;
  maxInputTokens: number;
  maxOutputTokens: number;
  timeoutMs: number;
};

export type InventoryExplainerAdapterResult =
  | { ok: true; candidate: InventoryExplainerAiCandidate }
  | {
      ok: false;
      reason: InventoryExplainerAdapterFailureReason;
      detail: string;
    };

export interface InventoryExplainerAiAdapter {
  readonly adapterId: "offline_stub" | "recorded_replay" | "live_provider";
  readonly supportsLiveNetwork: boolean;
  generate(
    input: {
      evidence: InventoryExplainerEvidence;
      questionId: InventoryExplainerQuestionId;
    },
    options: InventoryExplainerGenerateOptions,
  ): Promise<InventoryExplainerAdapterResult>;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error("aborted"));
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error("aborted"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export function createInventoryExplainerOfflineStubAdapter(options?: {
  behavior?: InventoryExplainerOfflineStubBehavior;
  provider?: string;
  model?: string;
}): InventoryExplainerAiAdapter {
  const behavior = options?.behavior ?? { mode: "echo_deterministic" };
  const provider = options?.provider ?? "offline_stub";
  const model = options?.model ?? "inventory-explainer-stub-v1";

  return {
    adapterId: "offline_stub",
    supportsLiveNetwork: false,
    async generate(input, genOptions) {
      if (behavior.mode === "hang_until_abort") {
        await new Promise<void>((_, reject) => {
          if (genOptions.signal.aborted) {
            reject(new Error("aborted"));
            return;
          }
          genOptions.signal.addEventListener(
            "abort",
            () => reject(new Error("aborted")),
            { once: true },
          );
        });
      }

      if (behavior.mode === "ignore_abort_late") {
        const delay = behavior.delayMs ?? genOptions.timeoutMs + 500;
        await sleep(delay, new AbortController().signal).catch(() => undefined);
      }

      if (behavior.mode === "error") {
        return {
          ok: false,
          reason: behavior.reason ?? "AI_UNAVAILABLE",
          detail: behavior.detail ?? "Stub error.",
        };
      }

      if (behavior.mode === "custom") {
        return { ok: true, candidate: behavior.candidate };
      }

      const deterministic = buildDeterministicInventoryExplainerAnswer(
        input.evidence,
        input.questionId,
      );

      if (behavior.mode === "hallucinate_number") {
        return {
          ok: true,
          candidate: {
            schemaVersion: INVENTORY_EXPLAINER_ANSWER_VERSION,
            adapterId: "offline_stub",
            provider,
            model,
            promptVersion: INVENTORY_EXPLAINER_PROMPT_VERSION,
            evidenceHash: input.evidence.evidenceHash,
            questionId: input.questionId,
            merchantAnswer: `${deterministic.merchantAnswer} Invented cover is 999 days.`,
            citedFactIds: deterministic.citations.map((c) => c.factId),
            suggestedNextStepCodes: deterministic.nextSteps.map((s) => s.code),
            usage: { latencyMs: 1, outputTokenEstimate: 80 },
          },
        };
      }

      if (behavior.mode === "inject_action") {
        return {
          ok: true,
          candidate: {
            schemaVersion: INVENTORY_EXPLAINER_ANSWER_VERSION,
            adapterId: "offline_stub",
            provider,
            model,
            promptVersion: INVENTORY_EXPLAINER_PROMPT_VERSION,
            evidenceHash: input.evidence.evidenceHash,
            questionId: input.questionId,
            merchantAnswer: "You should REORDER 40 units now and buy now.",
            citedFactIds: [],
            suggestedNextStepCodes: ["review_assumptions"],
            usage: { latencyMs: 1, outputTokenEstimate: 40 },
          },
        };
      }

      if (behavior.mode === "hash_mismatch") {
        return {
          ok: true,
          candidate: {
            schemaVersion: INVENTORY_EXPLAINER_ANSWER_VERSION,
            adapterId: "offline_stub",
            provider,
            model,
            promptVersion: INVENTORY_EXPLAINER_PROMPT_VERSION,
            evidenceHash:
              "sha256:0000000000000000000000000000000000000000000000000000000000000000",
            questionId: input.questionId,
            merchantAnswer: deterministic.merchantAnswer,
            citedFactIds: deterministic.citations.map((c) => c.factId),
            suggestedNextStepCodes: deterministic.nextSteps.map((s) => s.code),
            usage: { latencyMs: 1, outputTokenEstimate: 60 },
          },
        };
      }

      if (behavior.mode === "malformed") {
        return {
          ok: true,
          candidate: {
            schemaVersion: INVENTORY_EXPLAINER_ANSWER_VERSION,
            adapterId: "offline_stub",
            provider,
            model,
            promptVersion: INVENTORY_EXPLAINER_PROMPT_VERSION,
            evidenceHash: input.evidence.evidenceHash,
            questionId: input.questionId,
            merchantAnswer: "x",
            citedFactIds: ["not_a_fact" as never],
            suggestedNextStepCodes: ["launch_missiles" as never],
            usage: { latencyMs: 1, outputTokenEstimate: 1 },
          },
        };
      }

      // echo_deterministic — polish = deterministic prose (offline acceptance).
      return {
        ok: true,
        candidate: {
          schemaVersion: INVENTORY_EXPLAINER_ANSWER_VERSION,
          adapterId: "offline_stub",
          provider,
          model,
          promptVersion: INVENTORY_EXPLAINER_PROMPT_VERSION,
          evidenceHash: input.evidence.evidenceHash,
          questionId: input.questionId,
          merchantAnswer: deterministic.merchantAnswer,
          citedFactIds: deterministic.citations.map((c) => c.factId),
          suggestedNextStepCodes: deterministic.nextSteps.map((s) => s.code),
          usage: {
            latencyMs: 1,
            inputTokenEstimate: 200,
            outputTokenEstimate: Math.ceil(
              deterministic.merchantAnswer.length / 4,
            ),
          },
        },
      };
    },
  };
}
