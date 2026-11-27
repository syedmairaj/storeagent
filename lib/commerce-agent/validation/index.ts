/**
 * AI-ARCH-1d — grounded answer-draft validation surface.
 */

export {
  COMMERCE_AGENT_DRAFT_VERSION,
  COMMERCE_AGENT_PROMPT_VERSION,
  type CommerceAgentAnswerDraft,
  type CommerceAgentAssertedClaim,
  type CommerceAgentDraftAdapter,
  type CommerceAgentDraftAdapterFailureReason,
  type CommerceAgentDraftAdapterId,
  type CommerceAgentDraftAdapterResult,
  type CommerceAgentDraftGenerateOptions,
  type CommerceAgentDraftRejectionCode,
  type ValidateCommerceAgentDraftResult,
} from "@/lib/commerce-agent/validation/types";

export {
  detectPromptInjection,
  detectForbiddenActionClaims,
  detectForbiddenMarketClaims,
  detectUnsupportedSemanticClaims,
  detectHypothesisPresentedAsProven,
  detectEstimatePromotedToFact,
  detectUnauthorizedToolRequest,
  extractNumbers,
  numberAllowed,
} from "@/lib/commerce-agent/validation/detect";

export {
  validateCommerceAgentAnswerDraft,
  mapDraftRejectionToAgentCode,
} from "@/lib/commerce-agent/validation/validate-draft";

export {
  applyValidatedCommerceAgentDraft,
  polishCommerceAgentAnswer,
  abstainWhenNoDeterministicBaseline,
  type ApplyValidatedDraftResult,
  type PolishCommerceAgentAnswerResult,
} from "@/lib/commerce-agent/validation/apply-draft";

export {
  createCommerceAgentOfflineStubAdapter,
  assertLiveProviderForbidden,
  type CommerceAgentOfflineStubBehavior,
} from "@/lib/commerce-agent/validation/offline-stub";
