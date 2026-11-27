/**
 * AI-MKT-1d — claim-level validation against accepted normalized evidence.
 * Valid number ≠ supported claim. Partial match ≠ exact SKU. Search ≠ sales.
 */

import type { NormalizedEvidenceItem } from "@/lib/market-research/normalize/types";
import {
  detectEstimatePromotedToFact,
  detectForbiddenActionClaims,
  detectHypothesisPresentedAsProven,
  detectPromptInjection,
  extractNumbers,
  normalizeLiteral,
  numberAllowed,
} from "@/lib/commerce-agent/validation/detect";
import { isSha256EvidenceHash } from "@/lib/market-research/orchestration/evidence-hash";
import type {
  ClaimValidationRejectionCode,
  ClaimValidationResult,
  MaterialResearchClaim,
  ObservationTimeClaim,
  ProductGrainClaim,
} from "@/lib/market-research/orchestration/types";

const SALES_EQUIVALENCE = /\b(sold|sales|units?\s+sold|revenue|transaction\s+volume)\b/i;

function fail(
  claimId: string,
  code: ClaimValidationRejectionCode,
  detail: string,
): ClaimValidationResult {
  return { ok: false, claimId, code, detail };
}

function matchQualityToMaxGrain(
  quality: NormalizedEvidenceItem["matchQuality"],
): ProductGrainClaim {
  if (quality === "exact") return "exact_sku";
  if (quality === "partial") return "partial";
  if (quality === "unknown") return "unknown";
  return "unknown";
}

function grainRank(grain: ProductGrainClaim): number {
  switch (grain) {
    case "exact_sku":
      return 3;
    case "partial":
      return 2;
    case "category":
      return 1;
    default:
      return 0;
  }
}

function freshnessToObservation(
  item: NormalizedEvidenceItem,
): ObservationTimeClaim {
  if (!item.observationKnown || item.freshnessClass === "unknown") {
    return "unknown";
  }
  if (item.freshnessClass === "stale") {
    return "historical";
  }
  return "current";
}

function buildAllowlist(item: NormalizedEvidenceItem): Set<string> {
  const set = new Set<string>();
  for (const n of extractNumbers(item.rawValue)) {
    set.add(n);
    set.add(normalizeLiteral(n));
  }
  set.add(item.rawValue);
  if (item.unit) set.add(item.unit);
  if (item.currencyCode) set.add(item.currencyCode);
  set.add(item.countryCode);
  for (const url of item.citationUrls) {
    set.add(url);
  }
  return set;
}

/**
 * Validate one material claim against the accepted evidence map for this run.
 */
export function validateMaterialResearchClaim(input: {
  claim: MaterialResearchClaim;
  acceptedById: ReadonlyMap<string, NormalizedEvidenceItem>;
  rejectedEvidenceIds?: ReadonlySet<string>;
  evidenceHash: string;
  draftEvidenceHash?: string;
  conflictsTouching?: ReadonlySet<string>;
}): ClaimValidationResult {
  const claim = input.claim;

  if (
    input.draftEvidenceHash !== undefined &&
    input.draftEvidenceHash !== input.evidenceHash
  ) {
    return fail(claim.claimId, "HASH_MISMATCH", "Draft evidenceHash does not match run binding");
  }

  if (!isSha256EvidenceHash(input.evidenceHash)) {
    return fail(claim.claimId, "HASH_MISMATCH", "Run evidenceHash is malformed");
  }

  if (input.rejectedEvidenceIds?.has(claim.evidenceId)) {
    return fail(
      claim.claimId,
      "EVIDENCE_REJECTED_ID",
      "Claim cites rejected evidence id",
    );
  }

  const evidence = input.acceptedById.get(claim.evidenceId);
  if (!evidence) {
    return fail(
      claim.claimId,
      "EVIDENCE_NOT_ACCEPTED",
      `Evidence '${claim.evidenceId}' is not in accepted set (forged or missing citation)`,
    );
  }

  if (!evidence.licenseOk) {
    return fail(claim.claimId, "RIGHTS_MISMATCH", "Evidence licenseOk is false");
  }

  // Exact value bind — number present elsewhere is insufficient.
  if (normalizeLiteral(claim.assertedValue) !== normalizeLiteral(evidence.rawValue)) {
    // Allow only when asserted equals rawValue literally after normalize.
    if (claim.assertedValue !== evidence.rawValue) {
      return fail(
        claim.claimId,
        "VALUE_MISMATCH",
        "Asserted value does not exactly match bound evidence value",
      );
    }
  }

  const claimUnit = claim.unit ?? null;
  if (claimUnit !== evidence.unit) {
    return fail(claim.claimId, "UNIT_MISMATCH", "Claim unit does not match evidence unit");
  }

  const claimCurrency = claim.currencyCode ?? null;
  if (claimCurrency !== evidence.currencyCode) {
    return fail(
      claim.claimId,
      "CURRENCY_MISMATCH",
      "Claim currency does not match evidence currency",
    );
  }

  if (claim.countryCode !== evidence.countryCode) {
    return fail(
      claim.claimId,
      "COUNTRY_MISMATCH",
      "Claim country does not match evidence country",
    );
  }

  if (claim.claimClass !== evidence.claimClass) {
    return fail(
      claim.claimId,
      "CLAIM_CLASS_MISMATCH",
      "Claim class does not match evidence claim class",
    );
  }

  if (claim.signalClass !== evidence.signalClass) {
    return fail(
      claim.claimId,
      "SIGNAL_CLASS_MISMATCH",
      "Signal class does not match evidence signal class",
    );
  }

  // Claim-class promotions.
  if (
    evidence.claimClass === "hypothesis" &&
    (claim.claimClass === "sourced_signal" || claim.observationClass === "current")
  ) {
    return fail(
      claim.claimId,
      "HYPOTHESIS_PROMOTION",
      "Hypothesis cannot be promoted to sourced/current fact",
    );
  }
  if (
    evidence.claimClass === "estimate" &&
    claim.claimClass === "sourced_signal" &&
    claim.observationClass === "current"
  ) {
    return fail(
      claim.claimId,
      "ESTIMATE_PROMOTION",
      "Estimate cannot be promoted to current sourced fact",
    );
  }

  // Product grain: partial cannot support exact_sku.
  const maxGrain = matchQualityToMaxGrain(evidence.matchQuality);
  if (grainRank(claim.productGrain) > grainRank(maxGrain)) {
    return fail(
      claim.claimId,
      "PARTIAL_MATCH_OVERCLAIM",
      `Evidence matchQuality=${evidence.matchQuality} cannot support productGrain=${claim.productGrain}`,
    );
  }

  // Observation / freshness honesty.
  const evidenceObs = freshnessToObservation(evidence);
  if (claim.observationClass === "current") {
    if (evidenceObs === "historical") {
      return fail(
        claim.claimId,
        "STALE_AS_CURRENT_FORBIDDEN",
        "Stale/historical evidence cannot support current claims",
      );
    }
    if (evidenceObs === "unknown") {
      return fail(
        claim.claimId,
        "UNKNOWN_OBSERVATION_AS_CURRENT",
        "Unknown observation period cannot support current claims",
      );
    }
  }

  // Search / rank / review ≠ sales.
  if (
    (evidence.signalClass === "search_interest" ||
      evidence.signalClass === "rank_proxy" ||
      evidence.signalClass === "public_review") &&
    SALES_EQUIVALENCE.test(
      `${claim.proseFragment ?? ""} ${claim.assertedValue} ${claim.signalClass}`,
    )
  ) {
    return fail(
      claim.claimId,
      "SIGNAL_NOT_SALES",
      "Search/rank/review signals cannot support sales claims",
    );
  }

  // Conflicts / duplicates cannot inflate certainty via high confidence + current exact.
  if (
    input.conflictsTouching?.has(evidence.evidenceId) &&
    claim.observationClass === "current" &&
    claim.productGrain === "exact_sku" &&
    evidence.confidenceClass === "high"
  ) {
    return fail(
      claim.claimId,
      "CONFLICT_CERTAINTY_INFLATION",
      "Conflicting evidence cannot inflate certainty to exact current high-confidence",
    );
  }

  if (
    evidence.independenceClass === "duplicate" ||
    evidence.independenceClass === "unknown"
  ) {
    if (
      claim.productGrain === "exact_sku" &&
      claim.observationClass === "current" &&
      evidence.confidenceClass === "high"
    ) {
      return fail(
        claim.claimId,
        "DUPLICATE_INDEPENDENCE_INFLATION",
        "Duplicate/unknown independence cannot inflate exact current certainty",
      );
    }
  }

  // Prose checks.
  const prose = claim.proseFragment ?? "";
  if (prose) {
    if (detectPromptInjection(prose)) {
      return fail(claim.claimId, "PROMPT_INJECTION_SUSPECT", "Prompt injection in claim prose");
    }
    if (detectForbiddenActionClaims(prose)) {
      return fail(
        claim.claimId,
        "FORBIDDEN_ACTION_CLAIM",
        "Forbidden action in claim prose",
      );
    }
    if (detectHypothesisPresentedAsProven(prose)) {
      return fail(claim.claimId, "HYPOTHESIS_PROMOTION", "Hypothesis presented as proven");
    }
    if (detectEstimatePromotedToFact(prose)) {
      return fail(claim.claimId, "ESTIMATE_PROMOTION", "Estimate promoted to fact in prose");
    }
    if (SALES_EQUIVALENCE.test(prose) && evidence.signalClass !== "merchant_internal") {
      // Only merchant_internal could ever discuss owned sales — still not from search.
      if (
        evidence.signalClass === "search_interest" ||
        evidence.signalClass === "rank_proxy" ||
        evidence.signalClass === "public_review" ||
        evidence.signalClass === "public_listing" ||
        evidence.signalClass === "public_price"
      ) {
        return fail(
          claim.claimId,
          "SIGNAL_NOT_SALES",
          "External signal prose cannot assert sales volumes",
        );
      }
    }

    // Unsupported calculations / invented numbers in prose.
    const allowlist = buildAllowlist(evidence);
    for (const num of extractNumbers(prose)) {
      if (!numberAllowed(num, allowlist)) {
        // A valid number from *another* evidence row is still unsupported for this claim.
        return fail(
          claim.claimId,
          "UNSUPPORTED_CALCULATION",
          `Prose number '${num}' is not supported by bound evidence value`,
        );
      }
    }
  }

  return {
    ok: true,
    claimId: claim.claimId,
    evidenceId: evidence.evidenceId,
    boundEvidence: evidence,
  };
}

/**
 * Validate every material claim; fail closed on first rejection (caller may collect all).
 */
export function validateAllMaterialClaims(input: {
  claims: readonly MaterialResearchClaim[];
  accepted: readonly NormalizedEvidenceItem[];
  rejectedEvidenceIds?: ReadonlySet<string>;
  evidenceHash: string;
  draftEvidenceHash?: string;
  conflictEvidenceIds?: ReadonlySet<string>;
}):
  | { ok: true; results: readonly ClaimValidationResult[] }
  | {
      ok: false;
      results: readonly ClaimValidationResult[];
      firstFailure: Extract<ClaimValidationResult, { ok: false }>;
    } {
  const acceptedById = new Map(
    input.accepted.map((item) => [item.evidenceId, item] as const),
  );
  const results: ClaimValidationResult[] = [];
  let firstFailure: Extract<ClaimValidationResult, { ok: false }> | null = null;

  for (const claim of input.claims) {
    const result = validateMaterialResearchClaim({
      claim,
      acceptedById,
      rejectedEvidenceIds: input.rejectedEvidenceIds,
      evidenceHash: input.evidenceHash,
      draftEvidenceHash: input.draftEvidenceHash,
      conflictsTouching: input.conflictEvidenceIds,
    });
    results.push(result);
    if (!result.ok && !firstFailure) {
      firstFailure = result;
    }
  }

  if (firstFailure) {
    return { ok: false, results, firstFailure };
  }
  return { ok: true, results };
}

/** Detect forged citation ids that never appear in accepted evidence. */
export function detectFakeCitations(
  citedEvidenceIds: readonly string[],
  acceptedIds: ReadonlySet<string>,
): string[] {
  return citedEvidenceIds.filter((id) => !acceptedIds.has(id));
}
