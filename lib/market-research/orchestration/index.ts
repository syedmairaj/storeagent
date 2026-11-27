/**
 * AI-MKT-1d — bounded research orchestration & claim validation surface.
 */

export {
  MARKET_RESEARCH_ORCHESTRATION_VERSION,
  MARKET_RESEARCH_DRAFT_VERSION,
  MARKET_RESEARCH_DRAFT_PROMPT_VERSION,
  RESEARCH_ARCH_MAX_STEPS,
  RESEARCH_ARCH_MAX_TOOL_CALLS,
  RESEARCH_ARCH_MAX_DEADLINE_MS,
  RESEARCH_DEFAULT_MAX_STEPS,
  RESEARCH_DEFAULT_MAX_TOOL_CALLS,
  RESEARCH_DEFAULT_DEADLINE_MS,
  RESEARCH_DEFAULT_MAX_RETRIES,
  RESEARCH_DEFAULT_MAX_PAYLOAD_BYTES,
  RESEARCH_DEFAULT_MAX_DRAFT_CHARS,
  type ResearchOrchestrationStatus,
  type ResearchOrchestrationFailureCode,
  type ResearchPlanStepKind,
  type ResearchPlanStep,
  type ResearchExecutionBounds,
  type ResearchSpendCounters,
  type ResearchTraceStep,
  type ResearchRunTrace,
  type TrustedResearchRunBinding,
  type ProductGrainClaim,
  type ObservationTimeClaim,
  type MaterialResearchClaim,
  type ClaimValidationRejectionCode,
  type ClaimValidationResult,
  type ValidatedResearchFinding,
  type MarketResearchDraftAdapterId,
  type MarketResearchAnswerDraft,
  type MarketResearchDraftRejectionCode,
  type MarketResearchOrchestrationSuccess,
  type MarketResearchOrchestrationFailure,
  type MarketResearchOrchestrationResult,
} from "@/lib/market-research/orchestration/types";

export {
  resolveResearchExecutionBounds,
  createZeroSpendCounters,
  estimatePayloadBytes,
  deadlineExceeded,
  assertOfflineSpendOnly,
  type BoundsOverrideInput,
} from "@/lib/market-research/orchestration/bounds";

export {
  buildBoundedResearchPlan,
  assertNoRecursivePlanExpansion,
  type ResearchPlan,
} from "@/lib/market-research/orchestration/plan";

export {
  hashAcceptedResearchEvidence,
  hashTargetProductFingerprint,
  isSha256EvidenceHash,
} from "@/lib/market-research/orchestration/evidence-hash";

export {
  detectForgedBindingAuthority,
  buildTrustedResearchRunBinding,
  sealBindingEvidenceHash,
  type BindingAuthorityProbe,
} from "@/lib/market-research/orchestration/binding";

export {
  validateMaterialResearchClaim,
  validateAllMaterialClaims,
  detectFakeCitations,
} from "@/lib/market-research/orchestration/validate-claims";

export {
  isMarketResearchAnswerDraft,
  assertLiveResearchDraftForbidden,
  validateMarketResearchAnswerDraft,
  type ValidateResearchDraftResult,
  type MarketResearchDraftGenerateOptions,
  type MarketResearchDraftAdapterResult,
  type MarketResearchDraftAdapter,
} from "@/lib/market-research/orchestration/draft";

export {
  createMarketResearchOfflineStubAdapter,
  type MarketResearchOfflineStubBehavior,
} from "@/lib/market-research/orchestration/offline-stub";

export {
  synthesizeDeterministicFindings,
  applyOptionalResearchDraft,
  deterministicSynthesisOnly,
  type ApplyResearchDraftResult,
} from "@/lib/market-research/orchestration/synthesize";

export {
  runMarketResearchOrchestration,
  OPENAI_RETRIEVE_CONDITIONS,
  OPENAI_ANALYZE_CONDITIONS,
  OPENAI_DISPLAY_CONDITIONS,
  type RunMarketResearchOrchestrationInput,
} from "@/lib/market-research/orchestration/run";
