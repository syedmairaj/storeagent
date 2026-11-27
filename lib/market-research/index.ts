/**
 * AI-MKT-1a — market research contracts, source registry, and rights enforcement.
 * Offline / schema-neutral. No provider adapters, network, or persistence.
 */

export type {
  ResearchDepth,
  ResearchIntentClass,
  SignalClass,
  SourceRightsClass,
  ResearchOperation,
  ResearchPermissionDecision,
  ResearchFailureCode,
  MarketSourcePolicy,
  ResearchRequest,
  ResearchProvenance,
  ResearchEvidenceClaimClass,
  ResearchEvidenceItem,
  ResearchConflict,
  ResearchAbstention,
  ResearchResult,
  MarketSourceId,
} from "@/lib/market-research/types";

export {
  MARKET_SOURCE_POLICY_VERSION,
  MARKET_RESEARCH_REQUEST_VERSION,
  MARKET_RESEARCH_RESULT_VERSION,
  MARKET_RESEARCH_POLICY_PIN,
  MARKET_SOURCE_IDS,
  MARKET_ADAPTER_IDS,
} from "@/lib/market-research/types";

export {
  listMarketSourcePolicies,
  getMarketSourcePolicy,
  resolveMarketSourcePolicy,
  isRegisteredMarketSource,
  getMarketResearchPolicyPin,
  listMarketResearchOperations,
  registrationImpliesAuthorization,
} from "@/lib/market-research/registry";

export {
  evaluateSourceOperationRights,
  evaluateResolvedPolicyRights,
  deriveServerLicenseOk,
  mayUseGeminiAsAutomaticFallback,
  openaiConditionalRightsImplyLiveApproval,
  type RightsEvaluationInput,
  type RightsEvaluationResult,
} from "@/lib/market-research/rights";

export {
  getDefaultGeoCategoryPolicyConfig,
  evaluateGeoCategoryPolicy,
  isProductionGeoAllowlistDisabled,
  type GeoUsageClass,
  type GeoCategoryPolicyConfig,
  type GeoCategoryEvaluation,
} from "@/lib/market-research/geo-category";

export {
  FORBIDDEN_SCOPE_OVERRIDE_KEYS,
  resolveTrustedResearchScope,
  resolveEvidenceTimeClasses,
  type TrustedResearchScope,
  type ResearchScopeResolution,
  type UntrustedResearchScopeHints,
} from "@/lib/market-research/scope";

export {
  getDefaultMarketResearchConfig,
  readMarketResearchServerConfig,
  resolveMarketResearchEnablement,
  mayRunMarketResearch,
  assertLiveMarketResearchForbidden,
  assertL1MarketToolsRemainForbidden,
  type MarketResearchServerConfig,
  type ResolvedMarketResearchEnablement,
  type MayRunMarketResearchInput,
  type MayRunMarketResearchResult,
} from "@/lib/market-research/enablement";

export {
  parseResearchRequest,
  parseMarketSourcePolicy,
  parseResearchProvenance,
  parseResearchEvidenceItem,
  parseResearchResult,
  type ValidateOk,
  type ValidateErr,
  type ValidateResult,
} from "@/lib/market-research/validate";

export {
  mapResearchEvidenceToEvidenceRecord,
  type MapResearchEvidenceInput,
} from "@/lib/market-research/evidence-map";

export {
  admitMarketResearchRequest,
  type ResearchAdmissionInput,
  type ResearchAdmissionResult,
} from "@/lib/market-research/gate";
