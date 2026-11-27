/**
 * AI-MKT-1a — versioned market-research contracts.
 * Design: docs/AI_MKT_0_FEASIBILITY_AND_SOURCE_ARCHITECTURE.md §§3–6, 8–11.
 * Principle: The AI controls the investigation. It does not control what counts as a fact.
 *
 * Schema-neutral / offline. No provider execution, network, or persistence in 1a.
 */

export const MARKET_SOURCE_POLICY_VERSION =
  "market-source-policy-v1" as const;

export const MARKET_RESEARCH_REQUEST_VERSION =
  "market-research-request-v1" as const;

export const MARKET_RESEARCH_RESULT_VERSION =
  "market-research-result-v1" as const;

/** Canonical registry / policy pin for AI-MKT-1a (immutable server catalog). */
export const MARKET_RESEARCH_POLICY_PIN = "2026-11-27.mkt1a" as const;

export type ResearchDepth = "quick_lookup" | "standard" | "deep";

export type ResearchIntentClass =
  | "market_opportunity"
  | "zero_sales_diagnosis"
  | "competitor_research";

/**
 * External / market signal classes — distinct from EvidenceRecord.claimClass.
 * Never overload claimClass with these values.
 */
export type SignalClass =
  | "search_interest"
  | "public_listing"
  | "public_review"
  | "public_price"
  | "editorial"
  | "rank_proxy"
  | "other_sourced"
  | "merchant_internal";

export type SourceRightsClass =
  | "merchant_owned"
  | "provider_output_owned"
  | "display_only_no_cache"
  | "licensed_dataset"
  | "unknown_requires_legal"
  | "explicitly_prohibited";

/**
 * Discrete operations evaluated independently by the rights engine.
 * Deny-by-default: missing / UNKNOWN / revoked / expired / mismatched → deny.
 */
export type ResearchOperation =
  | "retrieve"
  | "display"
  | "normalize"
  | "analyze"
  | "model_process"
  | "cache"
  | "retain"
  | "redistribute";

export type ResearchPermissionDecision =
  | "allow"
  | "deny"
  | "conditional";

export type ResearchFailureCode =
  | "UNAUTHORIZED"
  | "TENANT_SCOPE_MISMATCH"
  | "UNSUPPORTED_GEO"
  | "UNSUPPORTED_CATEGORY"
  | "LICENSE_DENIED"
  | "SOURCE_REVOKED"
  | "SOURCE_UNKNOWN"
  | "POLICY_VERSION_MISMATCH"
  | "RIGHTS_CONDITIONS_UNSATISFIED"
  | "BUDGET"
  | "CREDIT_RESERVATION_FAILED"
  | "PROVIDER_FORBIDDEN"
  | "LIVE_EXECUTION_FORBIDDEN"
  | "RESEARCH_DISABLED"
  | "SSRF_BLOCKED"
  | "TIMEOUT"
  | "TRANSIENT"
  | "MATCH_AMBIGUOUS"
  | "INSUFFICIENT_EVIDENCE"
  | "ATTRIBUTION_REQUIRED"
  | "CACHE_FORBIDDEN"
  | "MALFORMED_REQUEST"
  | "FORGED_POLICY_INPUT"
  | "PROMPT_INJECTION_SUSPECT";

export type MarketSourcePolicy = {
  schemaVersion: typeof MARKET_SOURCE_POLICY_VERSION;
  policyVersion: string;
  sourceId: string;
  adapterId: string;
  rightsClass: SourceRightsClass;
  /** ISO country codes; empty = none allowed. No wildcard/global. */
  allowedCountries: readonly string[];
  allowedSignalClasses: readonly SignalClass[];
  /** Per-operation permissions — never inferred from registration alone. */
  operationPermissions: Readonly<
    Record<ResearchOperation, ResearchPermissionDecision>
  >;
  /** Explicit conditions required when a permission is `conditional`. */
  conditionalRequirements: Readonly<
    Partial<Record<ResearchOperation, readonly string[]>>
  >;
  attributionRequired: boolean;
  /** Durable / shared / cross-session cache eligibility. */
  durableCacheEligible: boolean;
  maxRetentionDays: number | null;
  /** Always false — training consent is never implied by registration. */
  modelTrainingConsentImplied: false;
  revoked: boolean;
  expiresAt: string | null;
  notes: string;
  revocationAction: "purge_tenant_cache" | "block_adapter" | "both";
};

export type ResearchRequest = {
  schemaVersion: typeof MARKET_RESEARCH_REQUEST_VERSION;
  clientRequestId: string;
  organizationId: string;
  storeId?: string;
  variantId?: string;
  sku?: string;
  countryCode: string;
  currencyCode?: string;
  categoryHint?: string;
  depth: ResearchDepth;
  intentClass: ResearchIntentClass;
  question: string;
  sourcePolicyVersion: string;
  maxCredits?: number;
  allowAdapters: readonly string[];
};

export type ResearchProvenance = {
  sourceId: string;
  adapterId: string;
  providerRequestId?: string;
  sourceUrls: readonly string[];
  /** Wall-clock when StoreAgent retrieved / received the payload. */
  retrievedAt: string;
  /**
   * Actual observation window of the underlying signal when known.
   * Unknown observation must not be treated as current.
   */
  observationPeriodStart?: string;
  observationPeriodEnd?: string;
  attributionText?: string;
  /** Gemini Search Suggestions opaque UI ref — not a warehouse key. */
  searchSuggestionsRef?: string;
  /**
   * Server-evaluated only. Callers must never supply a trusted true.
   * OpenAI Output ownership ≠ third-party page license.
   */
  licenseOk: boolean;
  rightsClass: SourceRightsClass;
  sourcePolicyVersion: string;
};

export type ResearchEvidenceClaimClass =
  | "sourced_signal"
  | "estimate"
  | "hypothesis"
  | "unknown";

export type ResearchEvidenceItem = {
  evidenceId: string;
  claimClass: ResearchEvidenceClaimClass;
  signalClass: SignalClass;
  label: string;
  value: string;
  unit?: string | null;
  countryCode: string;
  currencyCode?: string | null;
  matchQuality: "exact" | "partial" | "mismatch" | "unknown";
  freshnessClass: "current" | "stale" | "unknown";
  confidenceClass: "low" | "medium" | "high";
  provenance: ResearchProvenance;
  permittedFields: readonly string[];
};

export type ResearchConflict = {
  conflictId: string;
  evidenceIds: readonly string[];
  summary: string;
};

export type ResearchAbstention = {
  code: ResearchFailureCode;
  detail: string;
};

export type ResearchResult =
  | {
      ok: true;
      schemaVersion: typeof MARKET_RESEARCH_RESULT_VERSION;
      requestId: string;
      organizationId: string;
      evidence: readonly ResearchEvidenceItem[];
      conflicts: readonly ResearchConflict[];
      abstentions: readonly ResearchAbstention[];
      creditSettlement?:
        | "reserved"
        | "settled"
        | "refunded"
        | "not_applicable";
    }
  | {
      ok: false;
      schemaVersion: typeof MARKET_RESEARCH_RESULT_VERSION;
      code: ResearchFailureCode;
      detail: string;
      creditSettlement?: "refunded" | "not_applicable";
    };

/** Well-known source / adapter identifiers in the 1a registry. */
export const MARKET_SOURCE_IDS = {
  OPENAI_WEB_SEARCH: "openai_web_search_v1",
  GEMINI_SEARCH_GROUNDING: "gemini_search_grounding_v1",
  MERCHANT_INTERNAL: "merchant_internal_v1",
  SHOPIFY_CATALOG_PROHIBITED: "shopify_catalog_market_db_prohibited_v1",
  UNKNOWN_UNREGISTERED: "unknown_unregistered_v1",
} as const;

export type MarketSourceId =
  (typeof MARKET_SOURCE_IDS)[keyof typeof MARKET_SOURCE_IDS];

export const MARKET_ADAPTER_IDS = {
  OPENAI_WEB_SEARCH: "openai_web_search_v1",
  GEMINI_SEARCH_GROUNDING: "gemini_search_grounding_v1",
  MERCHANT_INTERNAL: "merchant_internal_v1",
  PROHIBITED_STUB: "prohibited_stub_v1",
  UNKNOWN_STUB: "unknown_stub_v1",
} as const;
