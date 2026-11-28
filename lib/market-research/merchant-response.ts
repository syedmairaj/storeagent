/**
 * AI-MKT-1e / AI-MKT-1f-R1 — merchant-safe market research DTO.
 * Explicit field allowlist from validated findings + bound evidence + display rights.
 * Never leaks traces, secrets, hashes of internals, approvals, adapters, or rejected evidence.
 * Browser-facing evidence/finding/conflict IDs are opaque response-scoped public IDs (1f-R1).
 */

import type {
  MarketResearchOrchestrationFailure,
  MarketResearchOrchestrationResult,
  MarketResearchOrchestrationSuccess,
  ValidatedResearchFinding,
} from "@/lib/market-research/orchestration/types";
import type { MerchantResearchStructuredDepth } from "@/lib/market-research/merchant-intents";
import type { MerchantResearchStructuredIntent } from "@/lib/market-research/merchant-intents";
import type { MerchantResearchCountryCode } from "@/lib/market-research/merchant-intents";
import {
  createMerchantPublicIdMapper,
  looksLikeInternalMarketResearchId,
  type MerchantPublicIdMapper,
} from "@/lib/market-research/merchant-public-ids";
import type {
  ResearchConflict,
  ResearchEvidenceClaimClass,
  SignalClass,
} from "@/lib/market-research/types";
import type { ProductMatchQuality } from "@/lib/market-research/normalize/types";

export type MerchantResearchFindingDto = {
  findingId: string;
  evidenceId: string;
  label: string;
  value: string;
  unit: string | null;
  claimClass: ResearchEvidenceClaimClass;
  signalClass: SignalClass;
  matchQuality: ProductMatchQuality;
  freshnessClass: "current" | "stale" | "unknown";
  observationClass: "current" | "historical" | "unknown";
  confidenceClass: "low" | "medium" | "high";
  countryCode: string;
  currencyCode: string | null;
  limitations: readonly string[];
  syntheticOriginPreserved: true;
  isRealMerchantOrMarketFact: false;
};

export type MerchantResearchCitationDto = {
  url: string;
  evidenceId: string;
};

export type MerchantResearchConflictDto = {
  conflictId: string;
  summary: string;
};

export type MerchantResearchAnswerDto = {
  ok: true;
  kind: "answered" | "partial";
  clientRequestId: string;
  intentClass: MerchantResearchStructuredIntent;
  countryCode: MerchantResearchCountryCode;
  depth: MerchantResearchStructuredDepth;
  status: "answered" | "partial";
  findings: readonly MerchantResearchFindingDto[];
  citations: readonly MerchantResearchCitationDto[];
  conflicts: readonly MerchantResearchConflictDto[];
  limitations: readonly string[];
  /** Deterministic merchant lines from findings — never raw draft prose. */
  summaryLines: readonly string[];
  originClass: "synthetic_fixture";
  syntheticOriginPreserved: true;
  isRealMerchantOrMarketFact: false;
  promotableToL1Findings: false;
  generator: "deterministic" | "draft_validated" | "fallback_deterministic";
  evidenceHash: string;
  /** Prominent synthetic preview honesty. */
  syntheticPreviewWarning: string;
};

export type MerchantResearchAbstentionDto = {
  ok: true;
  kind: "abstained";
  clientRequestId: string;
  intentClass: MerchantResearchStructuredIntent;
  countryCode: MerchantResearchCountryCode;
  depth: MerchantResearchStructuredDepth;
  code: string;
  merchantMessage: string;
  limitations: readonly string[];
  conflicts: readonly MerchantResearchConflictDto[];
  originClass: "synthetic_fixture";
  syntheticOriginPreserved: true;
  isRealMerchantOrMarketFact: false;
  syntheticPreviewWarning: string;
};

export type MerchantResearchRejectionCode =
  | "UNAUTHORIZED"
  | "PERMISSION_DENIED"
  | "RESEARCH_DISABLED"
  | "INVALID_INPUT"
  | "GRAIN_NOT_FOUND"
  | "TENANT_SCOPE_MISMATCH"
  | "UNSUPPORTED_INTENT"
  | "UNSUPPORTED_DEPTH"
  | "UNSUPPORTED_GEO"
  | "UNSUPPORTED_CATEGORY"
  | "PREVIEW_ISOLATION_VIOLATION"
  | "AI_UNAVAILABLE";

export type MerchantResearchErrorDto = {
  ok: false;
  code: MerchantResearchRejectionCode;
  error: string;
  clientRequestId?: string;
};

export type MerchantResearchDto =
  | MerchantResearchAnswerDto
  | MerchantResearchAbstentionDto
  | MerchantResearchErrorDto;

const SENSITIVE_KEY_RE =
  /forceEnabled|allowSyntheticFixtures|syntheticFixtureMode|fixtureId|organizationAllowlist|draftAdapter|bounds|licenseOk|satisfiedRetrieveConditions|satisfiedNormalizeConditions|satisfiedAnalyzeConditions|satisfiedDisplayConditions|approval|enablementSource|test_injected|supportsLiveNetwork|tokenEstimate|actualSpend|credits|binding|trace|Adapter|untrustedAuthority|researchAnswer|rejectedEvidence|rawEnvelope|secret|password|apiKey|serviceRole/i;

export const SYNTHETIC_PREVIEW_WARNING =
  "Synthetic preview only — not live market evidence. External signals are not verified inventory or sales facts. Partial match ≠ exact SKU; stale ≠ current; unknown ≠ zero; search/reviews/rank ≠ sales. No buying or pricing recommendation.";

function mapFinding(
  finding: ValidatedResearchFinding,
  ids: MerchantPublicIdMapper,
): MerchantResearchFindingDto {
  return {
    findingId: ids.mapFindingId(finding.findingId),
    evidenceId: ids.mapEvidenceId(finding.evidenceId),
    label: ids.redactInternalIdentifiers(finding.label),
    value: ids.redactInternalIdentifiers(finding.value),
    unit: finding.unit,
    claimClass: finding.claimClass,
    signalClass: finding.signalClass,
    matchQuality: finding.matchQuality,
    freshnessClass: finding.freshnessClass,
    observationClass: finding.observationClass,
    confidenceClass: finding.confidenceClass,
    countryCode: finding.countryCode,
    currencyCode: finding.currencyCode,
    limitations: finding.limitations.map((line) =>
      ids.redactInternalIdentifiers(line),
    ),
    syntheticOriginPreserved: true,
    isRealMerchantOrMarketFact: false,
  };
}

function mapConflict(
  conflict: ResearchConflict,
  ids: MerchantPublicIdMapper,
): MerchantResearchConflictDto {
  return {
    conflictId: ids.mapConflictId(conflict.conflictId),
    summary: ids.redactInternalIdentifiers(conflict.summary),
  };
}

function buildSummaryLines(
  findings: readonly MerchantResearchFindingDto[],
): readonly string[] {
  return findings.map((finding) => {
    const unit = finding.unit ? ` ${finding.unit}` : "";
    const matchNote =
      finding.matchQuality === "exact"
        ? ""
        : ` · match: ${finding.matchQuality} (not exact SKU)`;
    const freshNote =
      finding.freshnessClass === "current"
        ? ""
        : ` · freshness: ${finding.freshnessClass}`;
    return `${finding.label}: ${finding.value}${unit}${matchNote}${freshNote}`;
  });
}

function collectCitations(
  result: MarketResearchOrchestrationSuccess,
  ids: MerchantPublicIdMapper,
): readonly MerchantResearchCitationDto[] {
  const out: MerchantResearchCitationDto[] = [];
  const seen = new Set<string>();
  for (const item of result.acceptedEvidence) {
    for (const url of item.citationUrls) {
      if (!/^https:\/\//i.test(url)) {
        continue;
      }
      const publicEvidenceId = ids.mapEvidenceId(item.evidenceId);
      const key = `${publicEvidenceId}::${url}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      out.push({ url, evidenceId: publicEvidenceId });
    }
  }
  return out;
}

function merchantMessageForAbstention(code: string, detail: string): string {
  switch (code) {
    case "INSUFFICIENT_EVIDENCE":
      return "Not enough accepted market evidence to answer safely.";
    case "RESEARCH_DISABLED":
      return "Market research is not enabled for this organization.";
    case "UNSUPPORTED_GEO":
      return "That country is not available for market research.";
    case "UNSUPPORTED_CATEGORY":
      return "That product category is not available for market research.";
    case "MATCH_AMBIGUOUS":
      return "Product match is too ambiguous to show market signals safely.";
    case "LICENSE_DENIED":
    case "RIGHTS_CONDITIONS_UNSATISFIED":
      return "Source rights do not allow displaying this research.";
    case "CANCELLED":
    case "LATE_RESPONSE_DISCARDED":
      return "That research request was discarded.";
    default:
      if (/conflict/i.test(detail) || /conflict/i.test(code)) {
        return "Conflicting market signals were found — no single answer is shown.";
      }
      return "Market research could not complete safely for this SKU.";
  }
}

/**
 * Convert orchestration result into a merchant-safe DTO.
 * Omits free-form researchAnswer / traces / binding / spend / rejected evidence.
 * Replaces internal evidence/finding/conflict IDs with opaque public IDs (1f-R1).
 */
export function toMerchantResearchDto(input: {
  result: MarketResearchOrchestrationResult;
  clientRequestId: string;
  intentClass: MerchantResearchStructuredIntent;
  countryCode: MerchantResearchCountryCode;
  depth: MerchantResearchStructuredDepth;
  /** Test-only stable mapper key — never accept from browser. */
  publicIdKeyMaterial?: string | Buffer;
}): MerchantResearchAnswerDto | MerchantResearchAbstentionDto {
  const { result, clientRequestId, intentClass, countryCode, depth } = input;
  const ids = createMerchantPublicIdMapper(input.publicIdKeyMaterial);

  if (result.status === "answered" || result.status === "partial") {
    const success = result as MarketResearchOrchestrationSuccess;
    const findings = success.findings.map((finding) => mapFinding(finding, ids));
    return {
      ok: true,
      kind: success.status === "partial" ? "partial" : "answered",
      clientRequestId,
      intentClass,
      countryCode,
      depth,
      status: success.status,
      findings,
      citations: collectCitations(success, ids),
      conflicts: success.conflicts.map((conflict) => mapConflict(conflict, ids)),
      limitations: success.limitations.map((line) =>
        ids.redactInternalIdentifiers(line),
      ),
      summaryLines: buildSummaryLines(findings),
      originClass: "synthetic_fixture",
      syntheticOriginPreserved: true,
      isRealMerchantOrMarketFact: false,
      promotableToL1Findings: false,
      generator: success.generator,
      evidenceHash: success.evidenceHash,
      syntheticPreviewWarning: SYNTHETIC_PREVIEW_WARNING,
    };
  }

  const failure = result as MarketResearchOrchestrationFailure;
  return {
    ok: true,
    kind: "abstained",
    clientRequestId,
    intentClass,
    countryCode,
    depth,
    code: failure.code,
    merchantMessage: ids.redactInternalIdentifiers(
      merchantMessageForAbstention(failure.code, failure.detail),
    ),
    limitations: failure.limitations.map((line) =>
      ids.redactInternalIdentifiers(line),
    ),
    conflicts: failure.conflicts.map((conflict) => mapConflict(conflict, ids)),
    originClass: "synthetic_fixture",
    syntheticOriginPreserved: true,
    isRealMerchantOrMarketFact: false,
    syntheticPreviewWarning: SYNTHETIC_PREVIEW_WARNING,
  };
}

export function merchantResearchError(input: {
  code: MerchantResearchRejectionCode;
  error: string;
  clientRequestId?: string;
}): MerchantResearchErrorDto {
  const ids = createMerchantPublicIdMapper();
  return {
    ok: false,
    code: input.code,
    error: ids.redactInternalIdentifiers(input.error),
    clientRequestId: input.clientRequestId,
  };
}

/**
 * Deep-ish scan that a serializable DTO does not leak sensitive internals
 * or internal market-research identifier formats.
 */
export function assertMerchantResearchSafeDto(value: unknown): void {
  const seen = new Set<unknown>();
  const stack: unknown[] = [value];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current == null || typeof current !== "object") {
      continue;
    }
    if (seen.has(current)) {
      continue;
    }
    seen.add(current);
    if (Array.isArray(current)) {
      for (const item of current) {
        stack.push(item);
      }
      continue;
    }
    for (const [key, nested] of Object.entries(current)) {
      if (SENSITIVE_KEY_RE.test(key)) {
        throw new Error(`UNSAFE_MERCHANT_RESEARCH_DTO_KEY:${key}`);
      }
      if (key === "trace" || key === "steps" || key === "binding") {
        throw new Error(`UNSAFE_MERCHANT_RESEARCH_DTO_KEY:${key}`);
      }
      if (
        (key === "evidenceId" ||
          key === "findingId" ||
          key === "conflictId") &&
        typeof nested === "string" &&
        looksLikeInternalMarketResearchId(nested)
      ) {
        throw new Error(`UNSAFE_MERCHANT_RESEARCH_DTO_INTERNAL_ID:${key}`);
      }
      if (typeof nested === "string" && looksLikeInternalMarketResearchId(nested)) {
        throw new Error(`UNSAFE_MERCHANT_RESEARCH_DTO_INTERNAL_ID:${key}`);
      }
      stack.push(nested);
    }
  }
}
