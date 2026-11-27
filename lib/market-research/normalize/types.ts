/**
 * AI-MKT-1c — evidence normalization & matching contracts.
 * Offline / schema-neutral. Adapter envelopes → accepted|rejected|conflict|abstention.
 * Principle: The AI controls the investigation. It does not control what counts as a fact.
 */

import type { MarketResearchOriginClass } from "@/lib/market-research/adapters/types";
import type {
  ResearchAbstention,
  ResearchConflict,
  ResearchEvidenceClaimClass,
  ResearchEvidenceItem,
  ResearchFailureCode,
  SignalClass,
} from "@/lib/market-research/types";

export const MARKET_RESEARCH_NORMALIZATION_VERSION =
  "market-research-normalization-v1" as const;

export type ProductMatchQuality = "exact" | "partial" | "mismatch" | "unknown";

export type ProductMatchReasonCode =
  | "GTIN_EXACT"
  | "MPN_BRAND_EXACT"
  | "BRAND_MODEL_VARIANT_EXACT"
  | "ATTRIBUTES_PARTIAL"
  | "BRAND_ONLY_PARTIAL"
  | "TITLE_PARTIAL"
  | "MISSING_IDENTIFIERS"
  | "INSUFFICIENT_ATTRIBUTES"
  | "AMBIGUOUS_ATTRIBUTES"
  | "GTIN_MISMATCH"
  | "MPN_MISMATCH"
  | "BRAND_MISMATCH"
  | "MODEL_MISMATCH"
  | "VARIANT_MISMATCH"
  | "SIZE_MISMATCH"
  | "COLOR_MISMATCH"
  | "CAPACITY_MISMATCH"
  | "PACK_QUANTITY_MISMATCH"
  | "CONDITION_MISMATCH"
  | "CATEGORY_MISMATCH"
  | "ACCESSORY_VS_PRODUCT"
  | "BUNDLE_VS_PRODUCT";

export type GeoMatchQuality =
  | "exact"
  | "compatible"
  | "mismatch"
  | "unproven"
  | "unknown";

export type GeoMatchReasonCode =
  | "COUNTRY_EXACT"
  | "CURRENCY_COMPATIBLE"
  | "COUNTRY_MISMATCH"
  | "CURRENCY_MISMATCH"
  | "UNIT_MISMATCH"
  | "GEO_UNPROVEN_DOMAIN_ONLY"
  | "GEO_UNPROVEN_CURRENCY_ONLY"
  | "GEO_UNKNOWN"
  | "FX_CONVERSION_UNAUTHORIZED"
  | "OBSERVATION_PERIOD_INVALID"
  | "REQUESTED_VS_SOURCE_MARKET_MISMATCH";

export type EvidenceRejectCode =
  | ResearchFailureCode
  | "PRODUCT_MISMATCH"
  | "PRODUCT_AMBIGUOUS"
  | "GEO_MISMATCH"
  | "GEO_UNPROVEN"
  | "CURRENCY_MISMATCH"
  | "UNIT_MISMATCH"
  | "CITATION_INVALID"
  | "CITATION_MISSING"
  | "CITATION_UNBOUND"
  | "CITATION_UNRELATED"
  | "CITATION_CLAIM_MISMATCH"
  | "DUPLICATE_NOT_INDEPENDENT"
  | "HONESTY_VIOLATION"
  | "SIGNAL_NOT_SALES"
  | "PROMOTION_REJECTED"
  | "SYNTHETIC_PROMOTION_FORBIDDEN"
  | "STALE_AS_CURRENT_FORBIDDEN"
  | "FUTURE_TIMESTAMP"
  | "OBSERVATION_PERIOD_INVALID"
  | "RETRIEVAL_REFRESH_FORBIDDEN"
  | "FX_UNAUTHORIZED"
  | "GEMINI_NORMALIZE_DENIED"
  | "ADAPTER_FAILURE"
  | "MALFORMED_ADAPTER_RESPONSE"
  | "ORIGIN_NOT_SYNTHETIC"
  | "INDEPENDENCE_UNKNOWN";

export type ProductMatchTarget = {
  brand?: string;
  model?: string;
  gtin?: string;
  mpn?: string;
  variant?: string;
  size?: string;
  color?: string;
  capacity?: string;
  packQuantity?: number;
  condition?: "new" | "refurbished" | "used" | "unknown";
  category?: string;
  role?: "product" | "accessory" | "bundle" | "unknown";
  title?: string;
};

export type ProductMatchResult = {
  quality: ProductMatchQuality;
  reasons: readonly ProductMatchReasonCode[];
};

export type GeoMatchResult = {
  quality: GeoMatchQuality;
  reasons: readonly GeoMatchReasonCode[];
  observedCountryCode: string | null;
  observedCurrencyCode: string | null;
};

export type CitationBindingResult =
  | {
      ok: true;
      urls: readonly string[];
    }
  | {
      ok: false;
      code: EvidenceRejectCode;
      detail: string;
    };

export type NormalizedEvidenceItem = {
  evidenceId: string;
  organizationId: string;
  clientRequestId: string;
  snippetId: string;
  originClass: MarketResearchOriginClass;
  /** Always true for 1c offline fixtures — never promotable to real L1 findings. */
  syntheticOriginPreserved: true;
  /** Always false — synthetic evidence is never a real merchant/market fact. */
  isRealMerchantOrMarketFact: false;
  claimClass: ResearchEvidenceClaimClass;
  signalClass: SignalClass;
  label: string;
  /** Raw observation value preserved; unknown ≠ zero. */
  rawValue: string;
  unit: string | null;
  countryCode: string;
  currencyCode: string | null;
  matchQuality: ProductMatchQuality;
  productMatchReasons: readonly ProductMatchReasonCode[];
  geoMatchQuality: GeoMatchQuality;
  geoMatchReasons: readonly GeoMatchReasonCode[];
  freshnessClass: "current" | "stale" | "unknown";
  confidenceClass: "low" | "medium" | "high";
  retrievedAt: string;
  observationPeriodStart: string | null;
  observationPeriodEnd: string | null;
  /** Observation known separately from retrieval. */
  observationKnown: boolean;
  sourceId: string;
  adapterId: string;
  sourcePolicyVersion: string;
  /** Server-evaluated only — never from caller licenseOk. */
  licenseOk: boolean;
  citationUrls: readonly string[];
  permittedFields: readonly string[];
  independenceClass: "independent" | "duplicate" | "unknown";
};

export type RejectedEvidenceItem = {
  rejectId: string;
  snippetId?: string;
  code: EvidenceRejectCode;
  detail: string;
  organizationId: string;
  clientRequestId: string;
  originClass: MarketResearchOriginClass;
};

export type NormalizationSuccess = {
  ok: true;
  schemaVersion: typeof MARKET_RESEARCH_NORMALIZATION_VERSION;
  originClass: MarketResearchOriginClass;
  organizationId: string;
  clientRequestId: string;
  sourceId: string;
  adapterId: string;
  sourcePolicyVersion: string;
  nowIso: string;
  accepted: readonly NormalizedEvidenceItem[];
  rejected: readonly RejectedEvidenceItem[];
  conflicts: readonly ResearchConflict[];
  abstentions: readonly ResearchAbstention[];
  /** ResearchEvidenceItem views of accepted rows (still synthetic). */
  researchEvidence: readonly ResearchEvidenceItem[];
};

export type NormalizationFailure = {
  ok: false;
  schemaVersion: typeof MARKET_RESEARCH_NORMALIZATION_VERSION;
  code: ResearchFailureCode | EvidenceRejectCode;
  detail: string;
  organizationId?: string;
  clientRequestId?: string;
  rejected?: readonly RejectedEvidenceItem[];
  abstentions?: readonly ResearchAbstention[];
};

export type NormalizationResult = NormalizationSuccess | NormalizationFailure;

export type EvidenceRecordPromotionResult =
  | {
      ok: false;
      code: "SYNTHETIC_PROMOTION_FORBIDDEN" | EvidenceRejectCode | ResearchFailureCode;
      detail: string;
    }
  | {
      ok: true;
      /** Only reachable for non-synthetic paths — unavailable in AI-MKT-1c. */
      never: true;
    };
