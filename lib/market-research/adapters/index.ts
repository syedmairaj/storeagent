/**
 * AI-MKT-1b — offline research adapters & synthetic fixtures.
 */

export {
  MARKET_RESEARCH_ADAPTER_RESPONSE_VERSION,
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
} from "@/lib/market-research/adapters/types";

export {
  buildOpenAiOfflineFixture,
  buildGeminiOfflineFixture,
  assertSyntheticOnly,
  type FixtureBuildContext,
} from "@/lib/market-research/adapters/fixtures";

export {
  createOpenAiOfflineStubAdapter,
  createOpenAiRecordedReplayAdapter,
  openaiCandidateApprovalImpliesLiveRights,
  type OpenAiOfflineAdapterOptions,
} from "@/lib/market-research/adapters/openai-offline";

export {
  createGeminiOfflineStubAdapter,
  createGeminiRecordedReplayAdapter,
  geminiAutomaticFallbackAllowed,
  type GeminiOfflineAdapterOptions,
} from "@/lib/market-research/adapters/gemini-offline";

export {
  getDefaultProviderApproval,
  evaluateProviderApproval,
  openaiDesignCandidateImpliesLiveApproval,
  type MarketResearchProviderApproval,
  type ProviderApprovalEvaluation,
} from "@/lib/market-research/adapters/approval";

export {
  listOfflineAdapterRegistryKeys,
  getOfflineAdapterFromRegistry,
  resolveOfflineResearchAdapter,
  isOfflineAllowlistedAdapterId,
  type MarketResearchAdapterRegistryKey,
  type ResolveAdapterResult,
} from "@/lib/market-research/adapters/registry";

export {
  invokeMarketResearchAdapter,
  DEFAULT_ADAPTER_TIMEOUT_MS,
  type InvokeMarketResearchAdapterInput,
  type InvokeMarketResearchAdapterResult,
} from "@/lib/market-research/adapters/invoke";
