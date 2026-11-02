/**
 * M7.4e E3.x — AI explanation adapter (server / test entry only).
 *
 * Client components must not import this module (node:crypto + adapters).
 * Default Actions UI uses composeDemoDecisionBrief; soft-enable passes
 * server-precomposed briefs as props.
 */

export {
  AI_EXPLANATION_ADAPTER_CONTRACT_VERSION,
  DECISION_BRIEF_GROUNDING_HASH_VERSION,
  AI_BRIEF_SEMANTIC_CLAIMS_VERSION,
  AI_NUMERIC_MUTATION_PROFILE_VERSION,
  AI_EXPLANATION_DEFAULT_TIMEOUT_MS,
  AI_EXPLANATION_DEFAULT_MAX_INPUT_TOKENS,
  AI_EXPLANATION_DEFAULT_MAX_OUTPUT_TOKENS,
  E3_1_FORCE_DETERMINISTIC_FALLBACK,
  GROUNDING_HASH_PREFIX,
  type AiExplanationAdapterContractVersion,
  type DecisionBriefGroundingHashVersion,
  type AiExplanationAdapterId,
  type AiExplanationEnablementSource,
  type DeterministicGroundingEnvelopeConstraints,
  type DeterministicGroundingEnvelopeRequest,
  type DeterministicGroundingEnvelope,
  type AiExplanationCandidateV1,
  type AiExplanationGenerateOptions,
  type AiExplanationAdapterFailureReason,
  type AiExplanationAdapterResult,
  type AiExplanationAdapter,
  type ExplainDecisionBriefOptions,
  type ExplainDecisionBriefDiagnostics,
  type ExplainDecisionBriefResult,
  type CandidateShapeValidationResult,
  type AiExplanationCandidateValidationResult,
  type SemanticallyValidatedAiExplanationCandidateRef,
} from "@/lib/decision-brief/ai/types";

export {
  compareCanonicalKeys,
  canonicalSerialize,
  buildGroundingHashPayload,
  computeGroundingHash,
  groundingHashesEqual,
} from "@/lib/decision-brief/ai/grounding-hash";

export {
  buildDeterministicGroundingEnvelope,
  type BuildDeterministicGroundingEnvelopeOptions,
} from "@/lib/decision-brief/ai/envelope";

export {
  validateCandidateClaimNesting,
  validateCandidateShape,
  validateAiExplanationCandidate,
} from "@/lib/decision-brief/ai/validate-candidate";

export {
  createOfflineStubAdapter,
  type OfflineStubBehavior,
  type OfflineStubAdapterOptions,
} from "@/lib/decision-brief/ai/offline-stub-adapter";

export {
  buildTemplatedOfflineStubCandidate,
} from "@/lib/decision-brief/ai/templated-stub-candidate";

export {
  createRecordedReplayAdapter,
  type RecordedReplayAdapterOptions,
} from "@/lib/decision-brief/ai/recorded-replay-adapter";

export {
  explainDecisionBriefFromGrounding,
  disabledAiExplanationOptions,
  testInjectedAiExplanationOptions,
  serverResolvedAiExplanationOptions,
} from "@/lib/decision-brief/ai/orchestrate";

export {
  getDefaultServerAiExplanationConfig,
  readServerAiExplanationConfig,
  resolveServerAiExplanationEnablement,
  type ServerAiExplanationConfig,
  type ResolvedServerAiExplanationEnablement,
} from "@/lib/decision-brief/ai/server-enablement";

// mergeAiValidatedBrief / withRejectedUsedFallback are intentionally NOT
// re-exported — only the orchestrator may produce ai_validated after mint.

export {
  toPrivacySafeAiExplanationLog,
  type PrivacySafeAiExplanationLog,
} from "@/lib/decision-brief/ai/privacy-safe-diagnostics";

export {
  composeDemoDecisionBriefWithAi,
  composeAllDemoDecisionBriefsWithAi,
  type ComposeDemoDecisionBriefWithAiOptions,
  type ComposeDemoDecisionBriefWithAiResult,
} from "@/lib/decision-brief/ai/compose-demo-ai-brief";
