/**
 * AI-MKT-1c — evidence normalization & product/geographic matching.
 */

export {
  MARKET_RESEARCH_NORMALIZATION_VERSION,
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
} from "@/lib/market-research/normalize/types";

export {
  matchProductAttributes,
  isComparableMatchQuality,
} from "@/lib/market-research/normalize/product-match";

export {
  matchGeographicObservation,
  isComparableGeoQuality,
  expectedCurrencyForCountry,
} from "@/lib/market-research/normalize/geo-match";

export {
  isValidHttpCitationUrl,
  validateCitationList,
  bindSnippetCitations,
} from "@/lib/market-research/normalize/citations";

export {
  DEFAULT_FRESHNESS_POLICY,
  evaluateEvidenceFreshness,
  type FreshnessPolicy,
  type FreshnessEvaluation,
} from "@/lib/market-research/normalize/freshness";

export {
  evaluateSnippetHonesty,
  deriveConfidenceClass,
  claimRequiresCitation,
  type HonestyEvaluation,
} from "@/lib/market-research/normalize/honesty";

export {
  dedupeAndDetectConflicts,
  type DedupeConflictOutcome,
} from "@/lib/market-research/normalize/dedupe";

export {
  validateAdapterEnvelopeForNormalize,
  type AdapterEnvelopeValidation,
} from "@/lib/market-research/normalize/validate-adapter";

export {
  OPENAI_NORMALIZE_CONDITIONS,
  normalizeMarketResearchEvidence,
  type NormalizeMarketResearchInput,
} from "@/lib/market-research/normalize/pipeline";

export {
  authorizeNormalizedEvidenceForL1Findings,
  mapAuthorizedResearchEvidenceToEvidenceRecord,
} from "@/lib/market-research/normalize/evidence-authorize";
