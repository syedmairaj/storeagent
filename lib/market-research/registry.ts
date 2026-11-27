/**
 * AI-MKT-1a — immutable, server-owned, versioned source registry.
 *
 * Registration ≠ authorization. No real provider is licensed solely by
 * appearing in this catalog or by Output ownership claims.
 */

import {
  MARKET_ADAPTER_IDS,
  MARKET_RESEARCH_POLICY_PIN,
  MARKET_SOURCE_IDS,
  MARKET_SOURCE_POLICY_VERSION,
  type MarketSourcePolicy,
  type ResearchOperation,
  type SignalClass,
} from "@/lib/market-research/types";

const ALL_OPS: readonly ResearchOperation[] = [
  "retrieve",
  "display",
  "normalize",
  "analyze",
  "model_process",
  "cache",
  "retain",
  "redistribute",
] as const;

function denyAllOps(): Record<ResearchOperation, "deny"> {
  return {
    retrieve: "deny",
    display: "deny",
    normalize: "deny",
    analyze: "deny",
    model_process: "deny",
    cache: "deny",
    retain: "deny",
    redistribute: "deny",
  };
}

const OPENAI_SIGNALS: readonly SignalClass[] = [
  "search_interest",
  "public_listing",
  "public_review",
  "public_price",
  "editorial",
  "rank_proxy",
  "other_sourced",
] as const;

const GEMINI_SIGNALS: readonly SignalClass[] = [
  "search_interest",
  "public_listing",
  "public_review",
  "public_price",
  "editorial",
  "rank_proxy",
  "other_sourced",
] as const;

const MERCHANT_SIGNALS: readonly SignalClass[] = ["merchant_internal"] as const;

/**
 * OpenAI Responses web_search — design candidate only.
 * Conditional rights preserve unresolved third-party page rights.
 * Registration / Output ownership ≠ live approval or implicit licenseOk.
 */
const OPENAI_POLICY: MarketSourcePolicy = {
  schemaVersion: MARKET_SOURCE_POLICY_VERSION,
  policyVersion: MARKET_RESEARCH_POLICY_PIN,
  sourceId: MARKET_SOURCE_IDS.OPENAI_WEB_SEARCH,
  adapterId: MARKET_ADAPTER_IDS.OPENAI_WEB_SEARCH,
  rightsClass: "provider_output_owned",
  allowedCountries: ["AE"],
  allowedSignalClasses: OPENAI_SIGNALS,
  operationPermissions: {
    retrieve: "conditional",
    display: "conditional",
    normalize: "conditional",
    analyze: "conditional",
    model_process: "conditional",
    cache: "conditional",
    retain: "conditional",
    redistribute: "deny",
  },
  conditionalRequirements: {
    retrieve: [
      "live_research_authorized",
      "third_party_source_rights_reviewed",
      "credit_reservation_ok",
    ],
    display: ["inline_citations_rendered", "third_party_source_rights_reviewed"],
    normalize: [
      "tenant_scoped_only",
      "third_party_source_rights_reviewed",
      "no_sales_from_search_equivalence",
    ],
    analyze: [
      "tenant_scoped_only",
      "third_party_source_rights_reviewed",
      "claim_class_sourced_signal_only",
    ],
    model_process: [
      "paid_business_non_training_tier",
      "third_party_source_rights_reviewed",
    ],
    cache: [
      "tenant_scoped_only",
      "third_party_source_rights_reviewed",
      "retention_within_max_days",
    ],
    retain: [
      "tenant_scoped_only",
      "third_party_source_rights_reviewed",
      "retention_within_max_days",
    ],
  },
  attributionRequired: true,
  durableCacheEligible: false,
  maxRetentionDays: null,
  modelTrainingConsentImplied: false,
  revoked: false,
  expiresAt: null,
  notes:
    "Design candidate only. OpenAI Output ownership does not license third-party cited pages. Live approval deferred past AI-MKT-1a.",
  revocationAction: "both",
};

/**
 * Gemini Grounding with Google Search — display-only candidate.
 * Durable/shared cache, warehouse normalization, downstream analysis /
 * model processing, and automatic fallback are denied unless separately
 * approved (not granted in 1a). Live execution remains blocked.
 */
const GEMINI_POLICY: MarketSourcePolicy = {
  schemaVersion: MARKET_SOURCE_POLICY_VERSION,
  policyVersion: MARKET_RESEARCH_POLICY_PIN,
  sourceId: MARKET_SOURCE_IDS.GEMINI_SEARCH_GROUNDING,
  adapterId: MARKET_ADAPTER_IDS.GEMINI_SEARCH_GROUNDING,
  rightsClass: "display_only_no_cache",
  allowedCountries: ["AE"],
  allowedSignalClasses: GEMINI_SIGNALS,
  operationPermissions: {
    retrieve: "conditional",
    display: "conditional",
    normalize: "deny",
    analyze: "deny",
    model_process: "deny",
    cache: "deny",
    retain: "conditional",
    redistribute: "deny",
  },
  conditionalRequirements: {
    retrieve: [
      "live_research_authorized",
      "display_only_path",
      "search_suggestions_renderable",
      "no_automatic_fallback",
    ],
    display: [
      "search_suggestions_rendered_with_results",
      "end_user_who_submitted_prompt",
    ],
    retain: [
      "end_user_chat_history_only",
      "no_shared_or_durable_research_cache",
      "no_cross_tenant_reuse",
    ],
  },
  attributionRequired: true,
  durableCacheEligible: false,
  maxRetentionDays: null,
  modelTrainingConsentImplied: false,
  revoked: false,
  expiresAt: null,
  notes:
    "Display-only candidate. No durable/shared cache, warehouse normalize, analyze, model_process, or automatic fallback in 1a. Live path blocked.",
  revocationAction: "both",
};

/** Merchant-owned internal analytics — GO for internal evidence spine. */
const MERCHANT_INTERNAL_POLICY: MarketSourcePolicy = {
  schemaVersion: MARKET_SOURCE_POLICY_VERSION,
  policyVersion: MARKET_RESEARCH_POLICY_PIN,
  sourceId: MARKET_SOURCE_IDS.MERCHANT_INTERNAL,
  adapterId: MARKET_ADAPTER_IDS.MERCHANT_INTERNAL,
  rightsClass: "merchant_owned",
  allowedCountries: ["AE", "US", "GB"],
  allowedSignalClasses: MERCHANT_SIGNALS,
  operationPermissions: {
    retrieve: "allow",
    display: "allow",
    normalize: "allow",
    analyze: "allow",
    model_process: "allow",
    cache: "allow",
    retain: "allow",
    redistribute: "deny",
  },
  conditionalRequirements: {},
  attributionRequired: false,
  durableCacheEligible: true,
  maxRetentionDays: null,
  modelTrainingConsentImplied: false,
  revoked: false,
  expiresAt: null,
  notes:
    "Tenant-owned StoreAgent / merchant analytics only. Cross-tenant redistribution denied. Not a competitor market DB.",
  revocationAction: "block_adapter",
};

/** Explicitly prohibited — Shopify Catalog as market intelligence warehouse. */
const SHOPIFY_CATALOG_PROHIBITED: MarketSourcePolicy = {
  schemaVersion: MARKET_SOURCE_POLICY_VERSION,
  policyVersion: MARKET_RESEARCH_POLICY_PIN,
  sourceId: MARKET_SOURCE_IDS.SHOPIFY_CATALOG_PROHIBITED,
  adapterId: MARKET_ADAPTER_IDS.PROHIBITED_STUB,
  rightsClass: "explicitly_prohibited",
  allowedCountries: [],
  allowedSignalClasses: [],
  operationPermissions: denyAllOps(),
  conditionalRequirements: {},
  attributionRequired: true,
  durableCacheEligible: false,
  maxRetentionDays: null,
  modelTrainingConsentImplied: false,
  revoked: false,
  expiresAt: null,
  notes:
    "Shopify Catalog / Global Catalog is NO-GO for AI-MKT merchant intelligence warehouse (AI-MKT-0 §2.3).",
  revocationAction: "block_adapter",
};

/**
 * Unknown / unregistered source sentinel.
 * UNKNOWN rights → fail closed for every operation.
 */
const UNKNOWN_UNREGISTERED: MarketSourcePolicy = {
  schemaVersion: MARKET_SOURCE_POLICY_VERSION,
  policyVersion: MARKET_RESEARCH_POLICY_PIN,
  sourceId: MARKET_SOURCE_IDS.UNKNOWN_UNREGISTERED,
  adapterId: MARKET_ADAPTER_IDS.UNKNOWN_STUB,
  rightsClass: "unknown_requires_legal",
  allowedCountries: [],
  allowedSignalClasses: [],
  operationPermissions: denyAllOps(),
  conditionalRequirements: {},
  attributionRequired: true,
  durableCacheEligible: false,
  maxRetentionDays: null,
  modelTrainingConsentImplied: false,
  revoked: false,
  expiresAt: null,
  notes: "Unregistered or UNKNOWN source — deny by default.",
  revocationAction: "both",
};

const REGISTRY: ReadonlyMap<string, MarketSourcePolicy> = new Map([
  [OPENAI_POLICY.sourceId, Object.freeze({ ...OPENAI_POLICY })],
  [GEMINI_POLICY.sourceId, Object.freeze({ ...GEMINI_POLICY })],
  [
    MERCHANT_INTERNAL_POLICY.sourceId,
    Object.freeze({ ...MERCHANT_INTERNAL_POLICY }),
  ],
  [
    SHOPIFY_CATALOG_PROHIBITED.sourceId,
    Object.freeze({ ...SHOPIFY_CATALOG_PROHIBITED }),
  ],
  [UNKNOWN_UNREGISTERED.sourceId, Object.freeze({ ...UNKNOWN_UNREGISTERED })],
]);

/** Frozen catalog snapshot — callers receive copies, never mutable registry refs. */
export function listMarketSourcePolicies(): readonly MarketSourcePolicy[] {
  return [...REGISTRY.values()].map((policy) => ({
    ...policy,
    allowedCountries: [...policy.allowedCountries],
    allowedSignalClasses: [...policy.allowedSignalClasses],
    operationPermissions: { ...policy.operationPermissions },
    conditionalRequirements: { ...policy.conditionalRequirements },
  }));
}

export function getMarketSourcePolicy(
  sourceId: string,
): MarketSourcePolicy | null {
  const normalized = sourceId.trim();
  if (!normalized) {
    return null;
  }
  const found = REGISTRY.get(normalized);
  if (!found) {
    return null;
  }
  return {
    ...found,
    allowedCountries: [...found.allowedCountries],
    allowedSignalClasses: [...found.allowedSignalClasses],
    operationPermissions: { ...found.operationPermissions },
    conditionalRequirements: { ...found.conditionalRequirements },
  };
}

/**
 * Resolve a registered policy or the UNKNOWN sentinel.
 * Never invents a licensed policy for an unregistered sourceId.
 */
export function resolveMarketSourcePolicy(
  sourceId: string,
): MarketSourcePolicy {
  return (
    getMarketSourcePolicy(sourceId) ??
    getMarketSourcePolicy(MARKET_SOURCE_IDS.UNKNOWN_UNREGISTERED)!
  );
}

export function isRegisteredMarketSource(sourceId: string): boolean {
  const normalized = sourceId.trim();
  return (
    REGISTRY.has(normalized) &&
    normalized !== MARKET_SOURCE_IDS.UNKNOWN_UNREGISTERED
  );
}

export function getMarketResearchPolicyPin(): string {
  return MARKET_RESEARCH_POLICY_PIN;
}

export function listMarketResearchOperations(): readonly ResearchOperation[] {
  return [...ALL_OPS];
}

/**
 * Source registration is intentionally separate from authorization.
 * A registered source may still be denied for every live operation.
 */
export function registrationImpliesAuthorization(): false {
  return false;
}
