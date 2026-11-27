/**
 * AI-ARCH-1d — provider-independent answer-draft contracts.
 * Drafts never become merchant output until validateCommerceAgentAnswerDraft passes.
 */

import type {
  AgentFailureCode,
  ClaimClass,
  DecisionRecommendation,
} from "@/lib/commerce-agent/types";

export const COMMERCE_AGENT_DRAFT_VERSION =
  "commerce-agent-answer-draft-v1" as const;

export const COMMERCE_AGENT_PROMPT_VERSION =
  "commerce-agent-prompt-v1" as const;

export type CommerceAgentDraftAdapterId = "offline_stub" | "recorded_replay";

export type CommerceAgentDraftRejectionCode =
  | "MALFORMED_OUTPUT"
  | "STALE_EVIDENCE"
  | "HALLUCINATED_NUMBER"
  | "FORBIDDEN_ACTION_CLAIM"
  | "PROMPT_INJECTION_SUSPECT"
  | "UNSUPPORTED_CLAIM"
  | "UNSUPPORTED_CITATION"
  | "CLAIM_CLASS_UPGRADE"
  | "SCOPE_MISMATCH"
  | "RECOMMENDATION_UNAUTHORIZED"
  | "LIVE_PROVIDER_FORBIDDEN"
  | "AI_TIMEOUT"
  | "AI_UNAVAILABLE"
  | "COST_CAP_EXCEEDED"
  | "RATE_LIMITED";

export type CommerceAgentAssertedClaim = {
  claimId: string;
  claimClass: ClaimClass;
  /** Draft must not mark hypotheses/estimates as verified observations. */
  verified?: boolean;
};

/**
 * Structured AI draft — prose + citations only.
 * Authoritative facts remain in the evidence bundle / deterministic answer.
 */
export type CommerceAgentAnswerDraft = {
  schemaVersion: typeof COMMERCE_AGENT_DRAFT_VERSION;
  adapterId: CommerceAgentDraftAdapterId | "live_provider";
  provider: string;
  model: string;
  promptVersion: string;
  evidenceHash: string;
  merchantAnswer: string;
  citedEvidenceIds: readonly string[];
  citedClaimIds?: readonly string[];
  assertedClaims?: readonly CommerceAgentAssertedClaim[];
  recommendedAction?: DecisionRecommendation;
  suggestedNextStepCodes?: readonly string[];
  usage?: {
    latencyMs: number;
    inputTokenEstimate?: number;
    outputTokenEstimate?: number;
  };
};

export type ValidateCommerceAgentDraftResult =
  | { ok: true }
  | {
      ok: false;
      reasons: readonly CommerceAgentDraftRejectionCode[];
      detail: string;
      /** Mapped agent failure codes for traces / abstention. */
      agentCodes: readonly AgentFailureCode[];
    };

export type CommerceAgentDraftAdapterFailureReason =
  | "AI_UNAVAILABLE"
  | "AI_TIMEOUT"
  | "AI_UNSUPPORTED_SHAPE"
  | "AI_PROMPT_INJECTION_SUSPECT"
  | "GROUNDING_HASH_MISMATCH"
  | "COST_CAP_EXCEEDED"
  | "RATE_LIMITED"
  | "MALFORMED_OUTPUT"
  | "UNSUPPORTED_CLAIM"
  | "LIVE_PROVIDER_FORBIDDEN";

export type CommerceAgentDraftAdapterResult =
  | { ok: true; draft: CommerceAgentAnswerDraft }
  | {
      ok: false;
      reason: CommerceAgentDraftAdapterFailureReason;
      detail: string;
    };

export type CommerceAgentDraftGenerateOptions = {
  signal: AbortSignal;
  maxInputTokens: number;
  maxOutputTokens: number;
  timeoutMs: number;
};

export interface CommerceAgentDraftAdapter {
  readonly adapterId: CommerceAgentDraftAdapterId | "live_provider";
  readonly supportsLiveNetwork: boolean;
  generate(
    input: {
      evidenceHash: string;
      merchantAnswerBaseline: string;
      allowlistedLiterals: readonly string[];
      evidenceIds: readonly string[];
      claimIds: readonly string[];
      nextStepCodes: readonly string[];
      recommendedAction?: DecisionRecommendation;
    },
    options: CommerceAgentDraftGenerateOptions,
  ): Promise<CommerceAgentDraftAdapterResult>;
}
