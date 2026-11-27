/**
 * AI-MKT-1a/1b/1c — market research contracts, source registry, rights enforcement,
 * offline provider adapters / synthetic fixtures, and evidence normalization /
 * product-geographic matching.
 * Schema-neutral. No live network, SDKs, persistence, orchestration, or credits.
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

export {
  MARKET_RESEARCH_ADAPTER_RESPONSE_VERSION,
  buildOpenAiOfflineFixture,
  buildGeminiOfflineFixture,
  assertSyntheticOnly,
  buildSyntheticOpenAiSuccessEnvelope,
  createOpenAiOfflineStubAdapter,
  createOpenAiRecordedReplayAdapter,
  openaiCandidateApprovalImpliesLiveRights,
  createGeminiOfflineStubAdapter,
  createGeminiRecordedReplayAdapter,
  geminiAutomaticFallbackAllowed,
  getDefaultProviderApproval,
  evaluateProviderApproval,
  openaiDesignCandidateImpliesLiveApproval,
  listOfflineAdapterRegistryKeys,
  getOfflineAdapterFromRegistry,
  resolveOfflineResearchAdapter,
  isOfflineAllowlistedAdapterId,
  invokeMarketResearchAdapter,
  DEFAULT_ADAPTER_TIMEOUT_MS,
  type MarketResearchAdapterMode,
  type MarketResearchOriginClass,
  type MarketResearchProviderShape,
  type MarketResearchAdapterFailureReason,
  type MarketResearchAdapterCitation,
  type MarketResearchAdapterSnippet,
  type MarketResearchAdapterConflictHint,
  type MarketResearchAdapterSuccess,
  type MarketResearchAdapterFailure,
  type MarketResearchAdapterResult,
  type MarketResearchAdapterGenerateOptions,
  type MarketResearchAdapterInput,
  type MarketResearchAdapter,
  type OpenAiOfflineFixtureId,
  type GeminiOfflineFixtureId,
  type MarketResearchOfflineFixtureId,
  type OpenAiOfflineAdapterOptions,
  type GeminiOfflineAdapterOptions,
  type MarketResearchProviderApproval,
  type ProviderApprovalEvaluation,
  type MarketResearchAdapterRegistryKey,
  type ResolveAdapterResult,
  type InvokeMarketResearchAdapterInput,
  type InvokeMarketResearchAdapterResult,
  type FixtureBuildContext,
  type MarketResearchProductAttributes,
  type MarketResearchGeoObservation,
} from "@/lib/market-research/adapters";

export {
  MARKET_RESEARCH_NORMALIZATION_VERSION,
  matchProductAttributes,
  isComparableMatchQuality,
  matchGeographicObservation,
  isComparableGeoQuality,
  expectedCurrencyForCountry,
  isValidHttpCitationUrl,
  validateCitationList,
  bindSnippetCitations,
  DEFAULT_FRESHNESS_POLICY,
  evaluateEvidenceFreshness,
  evaluateSnippetHonesty,
  deriveConfidenceClass,
  claimRequiresCitation,
  dedupeAndDetectConflicts,
  validateAdapterEnvelopeForNormalize,
  OPENAI_NORMALIZE_CONDITIONS,
  normalizeMarketResearchEvidence,
  authorizeNormalizedEvidenceForL1Findings,
  mapAuthorizedResearchEvidenceToEvidenceRecord,
  type ProductMatchQuality,
  type ProductMatchReasonCode,
  type GeoMatchQuality,
  type GeoMatchReasonCode,
  type EvidenceRejectCode,
  type ProductMatchTarget,
  type ProductMatchResult,
  type GeoMatchResult,
  type CitationBindingResult,
  type NormalizedEvidenceItem,
  type RejectedEvidenceItem,
  type NormalizationSuccess,
  type NormalizationFailure,
  type NormalizationResult,
  type EvidenceRecordPromotionResult,
  type FreshnessPolicy,
  type FreshnessEvaluation,
  type HonestyEvaluation,
  type DedupeConflictOutcome,
  type AdapterEnvelopeValidation,
  type NormalizeMarketResearchInput,
} from "@/lib/market-research/normalize";
