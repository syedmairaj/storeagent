/**
 * M7.4e E3.1 — offline AI explanation adapter foundation.
 *
 * Server / test entry only. Client components must not import this module
 * (uses node:crypto; Actions UI stays on composeDemoDecisionBrief).
 *
 * No live providers. No ai_validated delivery in E3.1.
 */

export {
  AI_EXPLANATION_ADAPTER_CONTRACT_VERSION,
  DECISION_BRIEF_GROUNDING_HASH_VERSION,
  AI_BRIEF_SEMANTIC_CLAIMS_VERSION,
  AI_NUMERIC_MUTATION_PROFILE_VERSION,
  AI_EXPLANATION_DEFAULT_TIMEOUT_MS,
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
  explainDecisionBriefFromGrounding,
  disabledAiExplanationOptions,
  testInjectedAiExplanationOptions,
} from "@/lib/decision-brief/ai/orchestrate";
