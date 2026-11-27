/**
 * AI-MKT-1d — bounded research orchestration & claim-validation contracts.
 * Offline / schema-neutral. Isolated from L1 commerce-agent routes.
 * Principle: The AI controls the investigation. It does not control what counts as a fact.
 */

import type { MarketResearchOriginClass } from "@/lib/market-research/adapters/types";
import type {
  EvidenceRejectCode,
  NormalizedEvidenceItem,
  ProductMatchQuality,
} from "@/lib/market-research/normalize/types";
import type {
  ResearchAbstention,
  ResearchConflict,
  ResearchEvidenceClaimClass,
  ResearchFailureCode,
  SignalClass,
} from "@/lib/market-research/types";

export const MARKET_RESEARCH_ORCHESTRATION_VERSION =
  "market-research-orchestration-v1" as const;

export const MARKET_RESEARCH_DRAFT_VERSION =
  "market-research-answer-draft-v1" as const;

export const MARKET_RESEARCH_DRAFT_PROMPT_VERSION =
  "market-research-draft-prompt-v1" as const;

/** AI-ARCH ceilings — research may lower but never exceed. */
export const RESEARCH_ARCH_MAX_STEPS = 6 as const;
export const RESEARCH_ARCH_MAX_TOOL_CALLS = 4 as const;
export const RESEARCH_ARCH_MAX_DEADLINE_MS = 8000 as const;

/** Research-specific defaults (≤ ARCH ceilings). */
export const RESEARCH_DEFAULT_MAX_STEPS = 6 as const;
export const RESEARCH_DEFAULT_MAX_TOOL_CALLS = 1 as const;
export const RESEARCH_DEFAULT_DEADLINE_MS = 2000 as const;
export const RESEARCH_DEFAULT_MAX_RETRIES = 0 as const;
export const RESEARCH_DEFAULT_MAX_PAYLOAD_BYTES = 64_000 as const;
export const RESEARCH_DEFAULT_MAX_DRAFT_CHARS = 2000 as const;

export type ResearchOrchestrationStatus =
  | "answered"
  | "partial"
  | "abstained"
  | "error";

export type ResearchOrchestrationFailureCode =
  | ResearchFailureCode
  | EvidenceRejectCode
  | "BOUNDS_EXCEEDED"
  | "STEP_CAP_EXCEEDED"
  | "TOOL_CAP_EXCEEDED"
  | "RETRY_CAP_EXCEEDED"
  | "PAYLOAD_CAP_EXCEEDED"
  | "DEADLINE_EXCEEDED"
  | "CANCELLED"
  | "LATE_RESPONSE_DISCARDED"
  | "DEEP_RESEARCH_FORBIDDEN"
  | "RECURSIVE_PLAN_FORBIDDEN"
  | "FORGED_BINDING"
  | "FORGED_EVIDENCE_INPUT"
  | "FORGED_APPROVAL_INPUT"
  | "CLAIM_HASH_MISMATCH"
  | "CLAIM_UNSUPPORTED"
  | "CLAIM_WRONG_UNIT"
  | "CLAIM_WRONG_CURRENCY"
  | "CLAIM_WRONG_COUNTRY"
  | "CLAIM_WRONG_VARIANT"
  | "CLAIM_WRONG_TIME"
  | "PARTIAL_MATCH_OVERCLAIM"
  | "STALE_AS_CURRENT_FORBIDDEN"
  | "UNKNOWN_OBSERVATION_AS_CURRENT"
  | "CONFLICT_CERTAINTY_INFLATION"
  | "DUPLICATE_INDEPENDENCE_INFLATION"
  | "SIGNAL_NOT_SALES"
  | "FAKE_CITATION"
  | "GEMINI_ANALYZE_DENIED"
  | "GEMINI_FALLBACK_DENIED"
  | "DRAFT_REJECTED"
  | "MALFORMED_DRAFT"
  | "L1_PROMOTION_FORBIDDEN"
  | "SPEND_LEDGER_FORBIDDEN";

export type ResearchPlanStepKind =
  | "admit"
  | "retrieve"
  | "normalize"
  | "analyze"
  | "synthesize"
  | "finalize";

export type ResearchPlanStep = {
  step: number;
  kind: ResearchPlanStepKind;
  purpose: string;
  /** True only for the single offline adapter retrieve step. */
  countsAsToolCall: boolean;
};

export type ResearchExecutionBounds = {
  maxSteps: number;
  maxToolCalls: number;
  deadlineMs: number;
  maxRetries: number;
  maxPayloadBytes: number;
  maxDraftChars: number;
};

export type ResearchSpendCounters = {
  /** Always 0 in AI-MKT-1d — no ledger / production budget. */
  actualSpend: 0;
  /** Always 0 — credits deferred to AI-MKT-1.1. */
  credits: 0;
  tokenEstimateIn: number;
  tokenEstimateOut: number;
  adapterCalls: number;
  failedAttempts: number;
  retriesUsed: number;
};

export type ResearchTraceStep = {
  step: number;
  kind: ResearchPlanStepKind | "verify" | "bound_check";
  ok: boolean;
  latencyMs?: number;
  note?: string;
  toolCallCounted?: boolean;
};

export type ResearchRunTrace = {
  schemaVersion: typeof MARKET_RESEARCH_ORCHESTRATION_VERSION;
  runId: string;
  startedAt: string;
  endedAt: string;
  steps: readonly ResearchTraceStep[];
  bounds: ResearchExecutionBounds;
  spend: ResearchSpendCounters;
};

/**
 * Trusted server-side binding for one research run.
 * Never constructed from caller-supplied evidence/policy/approval authority.
 */
export type TrustedResearchRunBinding = {
  runId: string;
  organizationId: string;
  storeId: string | null;
  variantId: string | null;
  sku: string | null;
  clientRequestId: string;
  sourceId: string;
  adapterId: string;
  sourcePolicyVersion: string;
  countryCode: string;
  currencyCode: string | null;
  targetProductFingerprint: string;
  /** Filled after normalize — empty until evidence accepted. */
  evidenceHash: string | null;
  originClass: MarketResearchOriginClass;
  syntheticOriginPreserved: true;
  licenseOk: boolean;
};

export type ProductGrainClaim =
  | "exact_sku"
  | "partial"
  | "category"
  | "unknown";

export type ObservationTimeClaim = "current" | "historical" | "unknown";

/**
 * Material factual/numeric claim asserted by a draft or deterministic synthesis.
 * Must bind 1:1 to accepted normalized evidence.
 */
export type MaterialResearchClaim = {
  claimId: string;
  evidenceId: string;
  assertedValue: string;
  unit?: string | null;
  currencyCode?: string | null;
  countryCode: string;
  claimClass: ResearchEvidenceClaimClass;
  signalClass: SignalClass;
  productGrain: ProductGrainClaim;
  observationClass: ObservationTimeClaim;
  /** Optional prose fragment that must not invent unsupported numbers. */
  proseFragment?: string;
};

export type ClaimValidationRejectionCode =
  | ResearchOrchestrationFailureCode
  | "EVIDENCE_NOT_ACCEPTED"
  | "EVIDENCE_REJECTED_ID"
  | "VALUE_MISMATCH"
  | "UNIT_MISMATCH"
  | "CURRENCY_MISMATCH"
  | "COUNTRY_MISMATCH"
  | "CLAIM_CLASS_MISMATCH"
  | "SIGNAL_CLASS_MISMATCH"
  | "PROVENANCE_MISMATCH"
  | "RIGHTS_MISMATCH"
  | "UNSUPPORTED_CALCULATION"
  | "HYPOTHESIS_PROMOTION"
  | "ESTIMATE_PROMOTION"
  | "PROMPT_INJECTION_SUSPECT"
  | "FORGED_CITATION"
  | "FORBIDDEN_ACTION_CLAIM"
  | "HASH_MISMATCH";

export type ClaimValidationResult =
  | {
      ok: true;
      claimId: string;
      evidenceId: string;
      boundEvidence: NormalizedEvidenceItem;
    }
  | {
      ok: false;
      claimId: string;
      code: ClaimValidationRejectionCode;
      detail: string;
    };

export type ValidatedResearchFinding = {
  findingId: string;
  evidenceId: string;
  claimClass: ResearchEvidenceClaimClass;
  signalClass: SignalClass;
  label: string;
  value: string;
  unit: string | null;
  countryCode: string;
  currencyCode: string | null;
  matchQuality: ProductMatchQuality;
  freshnessClass: "current" | "stale" | "unknown";
  observationClass: ObservationTimeClaim;
  confidenceClass: "low" | "medium" | "high";
  /** Never inflated by conflicts/duplicates. */
  certaintyInflated: false;
  limitations: readonly string[];
  syntheticOriginPreserved: true;
  isRealMerchantOrMarketFact: false;
};

export type MarketResearchDraftAdapterId = "offline_stub" | "recorded_replay";

export type MarketResearchAnswerDraft = {
  schemaVersion: typeof MARKET_RESEARCH_DRAFT_VERSION;
  adapterId: MarketResearchDraftAdapterId | "live_provider";
  provider: string;
  model: string;
  promptVersion: string;
  evidenceHash: string;
  researchAnswer: string;
  citedEvidenceIds: readonly string[];
  materialClaims: readonly MaterialResearchClaim[];
  usage?: {
    latencyMs: number;
    inputTokenEstimate?: number;
    outputTokenEstimate?: number;
  };
};

export type MarketResearchDraftRejectionCode =
  | ClaimValidationRejectionCode
  | "MALFORMED_OUTPUT"
  | "LIVE_PROVIDER_FORBIDDEN"
  | "DRAFT_TIMEOUT"
  | "DRAFT_UNAVAILABLE"
  | "ANSWER_TOO_SHORT"
  | "ANSWER_TOO_LONG"
  | "FORBIDDEN_ACTION_CLAIM"
  | "L1_PROMOTION_ATTEMPT";

export type MarketResearchOrchestrationSuccess = {
  status: "answered" | "partial";
  schemaVersion: typeof MARKET_RESEARCH_ORCHESTRATION_VERSION;
  runId: string;
  organizationId: string;
  clientRequestId: string;
  sourceId: string;
  adapterId: string;
  sourcePolicyVersion: string;
  evidenceHash: string;
  researchAnswer: string;
  findings: readonly ValidatedResearchFinding[];
  evidenceIds: readonly string[];
  acceptedEvidence: readonly NormalizedEvidenceItem[];
  conflicts: readonly ResearchConflict[];
  abstentions: readonly ResearchAbstention[];
  limitations: readonly string[];
  reasonCodes: readonly ResearchOrchestrationFailureCode[];
  originClass: MarketResearchOriginClass;
  syntheticOriginPreserved: true;
  isRealMerchantOrMarketFact: false;
  promotableToL1Findings: false;
  generator: "deterministic" | "draft_validated" | "fallback_deterministic";
  binding: TrustedResearchRunBinding;
  trace: ResearchRunTrace;
  spend: ResearchSpendCounters;
};

export type MarketResearchOrchestrationFailure = {
  status: "abstained" | "error";
  schemaVersion: typeof MARKET_RESEARCH_ORCHESTRATION_VERSION;
  runId: string;
  organizationId?: string;
  clientRequestId?: string;
  code: ResearchOrchestrationFailureCode;
  detail: string;
  reasonCodes: readonly ResearchOrchestrationFailureCode[];
  limitations: readonly string[];
  evidenceHash?: string;
  findings: readonly [];
  evidenceIds: readonly [];
  conflicts: readonly ResearchConflict[];
  abstentions: readonly ResearchAbstention[];
  originClass: MarketResearchOriginClass;
  syntheticOriginPreserved: true;
  isRealMerchantOrMarketFact: false;
  promotableToL1Findings: false;
  generator: "none";
  binding?: TrustedResearchRunBinding;
  trace: ResearchRunTrace;
  spend: ResearchSpendCounters;
  /** Always false — cancelled/late paths never emit findings. */
  producedFindings: false;
};

export type MarketResearchOrchestrationResult =
  | MarketResearchOrchestrationSuccess
  | MarketResearchOrchestrationFailure;
