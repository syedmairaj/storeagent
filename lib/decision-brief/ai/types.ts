/**
 * M7.4e E3.1 — provider-independent AI explanation adapter types.
 *
 * Fallback-only delivery. No live providers. groundingHash is
 * reproducibility / golden binding ONLY — never authentication,
 * attestation, enablement, or tenant authorization.
 */

import type {
  OrganizationMemberRole,
} from "@/lib/commerce-domain/types";

import type {
  DecisionBriefActionType,
  DecisionBriefClaim,
  DecisionBriefEvidenceFieldKey,
  DecisionBriefGroundingInput,
  DecisionBriefNextStepCode,
  DecisionBriefRejectionCode,
  DecisionBriefV1,
} from "@/lib/decision-brief/types";

export const AI_EXPLANATION_ADAPTER_CONTRACT_VERSION =
  "ai-explanation-adapter-v1" as const;

export const DECISION_BRIEF_GROUNDING_HASH_VERSION =
  "decision-brief-grounding-hash-v1" as const;

export const AI_BRIEF_SEMANTIC_CLAIMS_VERSION =
  "ai-brief-semantic-claims-v1" as const;

export const AI_NUMERIC_MUTATION_PROFILE_VERSION =
  "ai-numeric-mutation-v1" as const;

export const AI_EXPLANATION_DEFAULT_TIMEOUT_MS =
  2500 as const;

/**
 * E3.1 hard freeze: product/orchestrator builds always force fallback.
 * First possible ai_validated delivery is E3.2+.
 */
export const E3_1_FORCE_DETERMINISTIC_FALLBACK =
  true as const;

export const GROUNDING_HASH_PREFIX =
  "sha256:" as const;

export type AiExplanationAdapterContractVersion =
  typeof AI_EXPLANATION_ADAPTER_CONTRACT_VERSION;

export type DecisionBriefGroundingHashVersion =
  typeof DECISION_BRIEF_GROUNDING_HASH_VERSION;

export type AiExplanationAdapterId =
  | "offline_stub"
  | "recorded_replay"
  | "live_provider";

/**
 * How enablement booleans were obtained. Required so E3.1 test
 * injection cannot be confused with E3.3 trusted server configuration.
 */
export type AiExplanationEnablementSource =
  | "disabled_default"
  | "test_injected"
  | "server_resolved_config";

export type DeterministicGroundingEnvelopeConstraints = {
  allowedActionType: DecisionBriefActionType;
  allowedNextStepCodes: readonly DecisionBriefNextStepCode[];
  allowedEvidenceRefs: readonly string[];
  forbidFinancialClaims: true;
  forbidConfidencePercent: true;
  forbidWatchPurchaseImplication: boolean;
  maxWhyNowSentences: 3;
  maxUncertaintySentences: 3;
  maxNextStepSentences: 2;
};

export type DeterministicGroundingEnvelopeRequest = {
  organizationId: string | null;
  briefId: string;
  locale: "en-US";
  promptVersion: string;
  semanticProfileVersion: typeof AI_BRIEF_SEMANTIC_CLAIMS_VERSION;
  numericProfileVersion: typeof AI_NUMERIC_MUTATION_PROFILE_VERSION;
};

/**
 * Immutable, hashable view of DecisionBriefGroundingInput for AI explanation.
 * Built AFTER validateGrounding() succeeds. Adapter mutations are discarded.
 */
export interface DeterministicGroundingEnvelope {
  schemaVersion: "decision-brief-v1";
  adapterContractVersion: AiExplanationAdapterContractVersion;
  groundingSerializationVersion: DecisionBriefGroundingHashVersion;
  briefMode: "synthetic_demo";
  /**
   * Stable hash of canonicalized grounding.
   * Reproducibility / cache / golden binding ONLY.
   */
  groundingHash: string;
  grounding: DecisionBriefGroundingInput;
  constraints: DeterministicGroundingEnvelopeConstraints;
  request: DeterministicGroundingEnvelopeRequest;
}

export interface AiExplanationCandidateV1 {
  schemaVersion: AiExplanationAdapterContractVersion;
  adapterId: AiExplanationAdapterId;
  provider: string;
  model: string;
  promptVersion: string;
  semanticProfileVersion: typeof AI_BRIEF_SEMANTIC_CLAIMS_VERSION;
  groundingHash: string;
  prose: {
    whyNowSummary: string;
    uncertaintySummary: string;
    nextStepSummary: string;
  };
  claims: readonly DecisionBriefClaim[];
  suggestedNextStepCode?: DecisionBriefNextStepCode;
  evidenceEmphasis?: readonly DecisionBriefEvidenceFieldKey[];
  usage?: {
    latencyMs: number;
    inputTokenEstimate?: number;
    outputTokenEstimate?: number;
  };
}

export interface AiExplanationGenerateOptions {
  signal: AbortSignal;
  maxInputTokens: number;
  maxOutputTokens: number;
  /** Wall-clock budget; orchestrator enforces independently of adapter cooperation */
  timeoutMs: number;
}

export type AiExplanationAdapterFailureReason =
  | "AI_UNAVAILABLE"
  | "AI_TIMEOUT"
  | "AI_UNSUPPORTED_SHAPE"
  | "AI_PROMPT_INJECTION_SUSPECT"
  | "GROUNDING_HASH_MISMATCH"
  | "COST_CAP_EXCEEDED";

export type AiExplanationAdapterResult =
  | {
      ok: true;
      candidate: AiExplanationCandidateV1;
    }
  | {
      ok: false;
      reason: AiExplanationAdapterFailureReason;
      detail: string;
    };

export interface AiExplanationAdapter {
  readonly adapterId: AiExplanationAdapterId;
  readonly supportsLiveNetwork: boolean;
  generate(
    envelope: DeterministicGroundingEnvelope,
    options: AiExplanationGenerateOptions,
  ): Promise<AiExplanationAdapterResult>;
}

export type ExplainDecisionBriefOptions = {
  role: OrganizationMemberRole;
  /**
   * ISO datetime of brief assembly. When enablement is OFF, callers that
   * pass a fixed generatedAt must keep doing so for E2 reproducibility.
   */
  generatedAt?: string;
  briefId: string;
  /**
   * Enablement pair — NEVER trusted from client HTTP body or model/stub output.
   */
  aiExplanationEnabled: boolean;
  allowlistMatch: boolean;
  enablementSource: AiExplanationEnablementSource;
  adapter?: AiExplanationAdapter;
  timeoutMs?: number;
  maxInputTokens?: number;
  maxOutputTokens?: number;
  promptVersion?: string;
  /**
   * E3.1 hard freeze: always true in this slice. Candidates are discarded
   * after optional harness validation; never returns generator=ai_validated.
   */
  forceDeterministicFallback: boolean;
};

/**
 * Harness-only diagnostics. Must not drive merchant chrome in E3.1.
 * Prefer E2-identical accepted fallback on the returned brief.
 */
export type ExplainDecisionBriefDiagnostics = {
  aiAttempted: boolean;
  enablementSource: AiExplanationEnablementSource;
  forceDeterministicFallback: true;
  candidateReceived: boolean;
  candidateDiscarded: boolean;
  discardReasons: readonly DecisionBriefRejectionCode[];
  adapterFailureReason?: AiExplanationAdapterFailureReason;
  groundingHash?: string;
  lateResultDiscarded: boolean;
};

export type ExplainDecisionBriefResult =
  | {
      ok: true;
      brief: DecisionBriefV1;
      diagnostics: ExplainDecisionBriefDiagnostics;
    }
  | {
      ok: false;
      reasons: readonly DecisionBriefRejectionCode[];
      detail: string;
      diagnostics: ExplainDecisionBriefDiagnostics;
    };

export type CandidateShapeValidationResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      reasons: readonly DecisionBriefRejectionCode[];
      detail: string;
      adapterReason?: AiExplanationAdapterFailureReason;
    };
