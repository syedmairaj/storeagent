/**
 * AI-ARCH-1a–1e — commerce agent contracts, L1 tools, orchestrator, draft validation,
 * and guarded merchant investigation UX entry (soft-enable default OFF).
 */

export type {
  AgentQuery,
  MerchantContext,
  ToolDefinition,
  ToolResult,
  ToolPermission,
  EvidenceRecord,
  Claim,
  ClaimClass,
  DecisionRecommendation,
  DecisionRecommendationActionClass,
  ApprovalBoundary,
  AgentAnswer,
  AgentAbstention,
  AgentRunResult,
  AgentTrace,
  AgentFailureCode,
  AgentIntentClass,
  CommerceAgentEvidenceBundle,
  MapInventoryExplainerEvidenceResult,
} from "@/lib/commerce-agent/types";

export {
  COMMERCE_AGENT_QUERY_VERSION,
  COMMERCE_AGENT_CONTEXT_VERSION,
  COMMERCE_AGENT_TRACE_VERSION,
  COMMERCE_AGENT_EVIDENCE_BUNDLE_VERSION,
} from "@/lib/commerce-agent/types";

export {
  buildTrustedMerchantContext,
  queryAttemptsTenantOverride,
  resolveAuthoritativeOrganizationId,
  type TrustedMerchantContextInput,
} from "@/lib/commerce-agent/merchant-context";

export {
  mapInventoryExplainerEvidence,
  recommendationHasEvidenceAuthority,
} from "@/lib/commerce-agent/map-inventory-explainer-evidence";

export {
  L1_TOOL_IDS,
  L1_FORBIDDEN_TOOL_PREFIXES,
  L1_TOOL_DEFINITIONS,
  L1_TOOL_INPUT_SCHEMA_VERSION,
  isL1ToolId,
  isExplicitlyForbiddenToolId,
  getL1ToolDefinition,
  createEmptyL1ToolDeps,
  createFixtureL1ToolDeps,
  invokeL1Tool,
  listL1ToolIds,
  type L1ToolId,
  type L1ToolDeps,
  type InvokeL1ToolInput,
  type L1ToolInvocationResult,
  type L1ToolFailureCode,
  type L1EvidenceVerification,
  type L1RecommendationEligibility,
} from "@/lib/commerce-agent/tools";

export {
  getDefaultCommerceAgentConfig,
  readCommerceAgentServerConfig,
  resolveCommerceAgentEnablement,
  mayRunCommerceAgent,
  ORCHESTRATOR_MAX_STEPS,
  ORCHESTRATOR_DEFAULT_DEADLINE_MS,
  ORCHESTRATOR_MAX_TOOL_CALLS,
  buildDeterministicPlan,
  isOrchestratorSupportedIntent,
  validateDeterministicPlan,
  assembleFromEvidenceBundle,
  runCommerceAgent,
  resolveGrainFromTrustedContext,
  type CommerceAgentServerConfig,
  type ResolvedCommerceAgentEnablement,
  type DeterministicPlan,
  type DeterministicPlanStep,
  type RunCommerceAgentInput,
  type ResolvedGrain,
} from "@/lib/commerce-agent/orchestrator";

export {
  COMMERCE_AGENT_DRAFT_VERSION,
  COMMERCE_AGENT_PROMPT_VERSION,
  validateCommerceAgentAnswerDraft,
  mapDraftRejectionToAgentCode,
  applyValidatedCommerceAgentDraft,
  polishCommerceAgentAnswer,
  createCommerceAgentOfflineStubAdapter,
  assertLiveProviderForbidden,
  detectPromptInjection,
  detectForbiddenActionClaims,
  detectForbiddenMarketClaims,
  type CommerceAgentAnswerDraft,
  type CommerceAgentDraftAdapter,
  type CommerceAgentDraftRejectionCode,
  type CommerceAgentOfflineStubBehavior,
  type ApplyValidatedDraftResult,
  type PolishCommerceAgentAnswerResult,
  type ValidateCommerceAgentDraftResult,
} from "@/lib/commerce-agent/validation";

export {
  COMMERCE_AGENT_STRUCTURED_INTENTS,
  isCommerceAgentStructuredIntent,
  getCommerceAgentIntentOption,
  type CommerceAgentStructuredIntent,
  type CommerceAgentIntentOption,
} from "@/lib/commerce-agent/intents";

export {
  toMerchantInvestigationDto,
  serializeAbstention,
  merchantInvestigationError,
  assertMerchantSafeDto,
  type MerchantInvestigationDto,
  type MerchantInvestigationAnswerDto,
  type MerchantInvestigationAbstentionDto,
  type MerchantInvestigationErrorDto,
  type MerchantInvestigationRejectionCode,
  type MerchantInvestigationClaimDto,
  type MerchantInvestigationEvidenceDto,
  type MerchantInvestigationRecommendationDto,
} from "@/lib/commerce-agent/merchant-response";

export {
  runGuardedMerchantInvestigation,
  FORBIDDEN_CLIENT_OVERRIDE_KEYS,
  type MerchantInvestigationInput,
  type MerchantInvestigationPorts,
  type MerchantInvestigationIdentity,
  type MerchantInvestigationOrgContext,
} from "@/lib/commerce-agent/merchant-investigation";

export {
  isCurrentCommerceAgentResponse,
  createCommerceAgentClientRequestId,
  type CommerceAgentRequestKey,
} from "@/lib/commerce-agent/client-request";

// createAuthorizedL1ToolDeps / actions stay server-only entrypoints — do not
// re-export from this barrel (would pull server-only loaders into client graphs).
