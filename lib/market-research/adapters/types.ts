/**
 * AI-MKT-1b — provider-independent research adapter contracts.
 * Offline only: offline_stub / recorded_replay. supportsLiveNetwork=false always.
 *
 * Adapter payloads are synthetic envelopes — not canonical findings (AI-MKT-1c).
 * Never invent sales volumes or treat fixtures as real merchant/market facts.
 */

import type {
  ResearchEvidenceClaimClass,
  ResearchFailureCode,
  SignalClass,
} from "@/lib/market-research/types";

export const MARKET_RESEARCH_ADAPTER_RESPONSE_VERSION =
  "market-research-adapter-response-v1" as const;

/** Only offline modes are registerable in AI-MKT-1b. */
export type MarketResearchAdapterMode = "offline_stub" | "recorded_replay";

/** Synthetic origin — never "observed_merchant_fact" or "live_provider". */
export type MarketResearchOriginClass = "synthetic_fixture";

export type MarketResearchProviderShape =
  | "openai_responses_web_search_v1"
  | "gemini_search_grounding_v1"
  | "merchant_internal_v1";

export type MarketResearchAdapterFailureReason =
  | "MALFORMED_PROVIDER_RESPONSE"
  | "EMPTY_RESULTS"
  | "MISSING_CITATIONS"
  | "MISSING_PROVENANCE"
  | "TIMEOUT"
  | "TRANSIENT"
  | "CANCELLED"
  | "LATE_RESPONSE_DISCARDED"
  | "LIVE_PROVIDER_FORBIDDEN"
  | "ADAPTER_UNKNOWN"
  | "ADAPTER_FORGED"
  | "ADAPTER_NOT_ALLOWLISTED"
  | "POLICY_DENIED"
  | "PROVIDER_FORBIDDEN"
  | "DATA_EGRESS_FORBIDDEN"
  | "RESEARCH_DISABLED"
  | "TENANT_SCOPE_MISMATCH"
  | "UNSUPPORTED_GEO"
  | "UNSUPPORTED_CATEGORY"
  | "LICENSE_DENIED"
  | "RIGHTS_CONDITIONS_UNSATISFIED"
  | "CACHE_FORBIDDEN"
  | "ATTRIBUTION_REQUIRED"
  | "AUTOMATIC_FALLBACK_FORBIDDEN"
  | "FORGED_POLICY_INPUT"
  | "MALFORMED_REQUEST";

export type MarketResearchAdapterCitation = {
  url: string;
  title?: string;
};

/**
 * Synthetic snippet — labeled fixture data only.
 * Not a normalized EvidenceRecord / finding (deferred to 1c).
 */
export type MarketResearchAdapterSnippet = {
  snippetId: string;
  text: string;
  signalClass: SignalClass;
  claimClass: ResearchEvidenceClaimClass;
  /** Always false for synthetic fixtures in 1b. */
  isRealMerchantOrMarketFact: false;
};

export type MarketResearchAdapterConflictHint = {
  conflictId: string;
  snippetIds: readonly string[];
  summary: string;
};

export type MarketResearchAdapterSuccess = {
  ok: true;
  schemaVersion: typeof MARKET_RESEARCH_ADAPTER_RESPONSE_VERSION;
  originClass: MarketResearchOriginClass;
  /** Human-readable synthetic label for audit / tests. */
  syntheticLabel: string;
  fixtureId: string;
  sourceId: string;
  adapterId: string;
  mode: MarketResearchAdapterMode;
  providerShape: MarketResearchProviderShape;
  sourcePolicyVersion: string;
  clientRequestId: string;
  organizationId: string;
  /** Wall-clock retrieval time (fixture clock). */
  retrievedAt: string;
  /**
   * Observation window when the fixture encodes one.
   * Unknown observation must not be treated as current.
   */
  observationPeriodStart?: string;
  observationPeriodEnd?: string;
  citations: readonly MarketResearchAdapterCitation[];
  snippets: readonly MarketResearchAdapterSnippet[];
  conflicts: readonly MarketResearchAdapterConflictHint[];
  /** Gemini display-only: opaque Search Suggestions UI ref (not warehouse key). */
  searchSuggestionsRef?: string;
  attributionText?: string;
  latencyMs: number;
};

export type MarketResearchAdapterFailure = {
  ok: false;
  schemaVersion: typeof MARKET_RESEARCH_ADAPTER_RESPONSE_VERSION;
  originClass: MarketResearchOriginClass;
  reason: MarketResearchAdapterFailureReason;
  detail: string;
  sourceId?: string;
  adapterId?: string;
  mode?: MarketResearchAdapterMode;
  fixtureId?: string;
  clientRequestId?: string;
  organizationId?: string;
  /** Mapped research failure code when applicable. */
  researchCode?: ResearchFailureCode;
  latencyMs?: number;
};

export type MarketResearchAdapterResult =
  | MarketResearchAdapterSuccess
  | MarketResearchAdapterFailure;

export type MarketResearchAdapterGenerateOptions = {
  signal: AbortSignal;
  timeoutMs: number;
  /** Fixture clock override for deterministic tests. */
  nowIso?: string;
};

export type MarketResearchAdapterInput = {
  clientRequestId: string;
  organizationId: string;
  countryCode: string;
  question: string;
  sourcePolicyVersion: string;
  sku?: string;
  categoryHint?: string;
  depth?: string;
};

/**
 * Provider-independent adapter. Live network is structurally false.
 */
export interface MarketResearchAdapter {
  readonly adapterId: string;
  readonly sourceId: string;
  readonly mode: MarketResearchAdapterMode;
  readonly supportsLiveNetwork: false;
  readonly originClass: MarketResearchOriginClass;
  readonly providerShape: MarketResearchProviderShape;
  research(
    input: MarketResearchAdapterInput,
    options: MarketResearchAdapterGenerateOptions,
  ): Promise<MarketResearchAdapterResult>;
}

/** OpenAI synthetic fixture scenario IDs. */
export type OpenAiOfflineFixtureId =
  | "openai_success_citations_v1"
  | "openai_empty_results_v1"
  | "openai_malformed_response_v1"
  | "openai_conflicting_signals_v1"
  | "openai_missing_provenance_v1"
  | "openai_missing_citations_v1"
  | "openai_timeout_v1"
  | "openai_transient_failure_v1"
  | "openai_hang_until_abort_v1"
  | "openai_late_response_v1";

/** Gemini display-only synthetic fixture scenario IDs. */
export type GeminiOfflineFixtureId =
  | "gemini_display_only_success_v1"
  | "gemini_missing_search_suggestions_v1"
  | "gemini_empty_results_v1"
  | "gemini_timeout_v1"
  | "gemini_hang_until_abort_v1";

export type MarketResearchOfflineFixtureId =
  | OpenAiOfflineFixtureId
  | GeminiOfflineFixtureId
  | "merchant_internal_success_v1";
