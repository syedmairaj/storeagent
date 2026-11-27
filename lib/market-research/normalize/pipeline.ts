/**
 * AI-MKT-1c — evidence normalization pipeline.
 * Consumes admitted 1b adapter results; re-evaluates normalize rights;
 * never trusts response licenseOk or caller-supplied scope.
 */

import type { MerchantContext } from "@/lib/commerce-agent/types";
import type { MarketResearchAdapterResult } from "@/lib/market-research/adapters/types";
import { MARKET_SOURCE_IDS } from "@/lib/market-research/types";
import {
  deriveServerLicenseOk,
  evaluateSourceOperationRights,
} from "@/lib/market-research/rights";
import {
  FORBIDDEN_SCOPE_OVERRIDE_KEYS,
  resolveTrustedResearchScope,
  type UntrustedResearchScopeHints,
} from "@/lib/market-research/scope";
import {
  MARKET_RESEARCH_POLICY_PIN,
  type ResearchEvidenceItem,
  type ResearchFailureCode,
  type ResearchRequest,
} from "@/lib/market-research/types";
import { parseResearchRequest } from "@/lib/market-research/validate";
import { bindSnippetCitations } from "@/lib/market-research/normalize/citations";
import { dedupeAndDetectConflicts } from "@/lib/market-research/normalize/dedupe";
import { evaluateEvidenceFreshness } from "@/lib/market-research/normalize/freshness";
import {
  isComparableGeoQuality,
  matchGeographicObservation,
} from "@/lib/market-research/normalize/geo-match";
import {
  claimRequiresCitation,
  deriveConfidenceClass,
  evaluateSnippetHonesty,
} from "@/lib/market-research/normalize/honesty";
import {
  isComparableMatchQuality,
  matchProductAttributes,
} from "@/lib/market-research/normalize/product-match";
import type {
  EvidenceRejectCode,
  NormalizationResult,
  NormalizedEvidenceItem,
  ProductMatchTarget,
  RejectedEvidenceItem,
} from "@/lib/market-research/normalize/types";
import { MARKET_RESEARCH_NORMALIZATION_VERSION } from "@/lib/market-research/normalize/types";
import { validateAdapterEnvelopeForNormalize } from "@/lib/market-research/normalize/validate-adapter";

export const OPENAI_NORMALIZE_CONDITIONS = [
  "tenant_scoped_only",
  "third_party_source_rights_reviewed",
  "no_sales_from_search_equivalence",
] as const;

export type NormalizeMarketResearchInput = {
  merchantContext: MerchantContext;
  /** Trusted or parseable research request. */
  rawRequest: unknown;
  adapterResult: MarketResearchAdapterResult | unknown;
  targetProduct: ProductMatchTarget;
  /** Injected clock for deterministic freshness. */
  nowIso: string;
  satisfiedNormalizeConditions?: readonly string[];
  untrustedHints?: UntrustedResearchScopeHints | null;
  requestedUnit?: string | null;
  fxRatesAuthorized?: boolean;
  /**
   * Test/fixture hook: claim freshness from retrieval (must be rejected).
   */
  claimedFreshnessFromRetrieval?: boolean;
};

function deterministicEvidenceId(input: {
  organizationId: string;
  clientRequestId: string;
  snippetId: string;
}): string {
  return `mkt1c:${input.organizationId}:${input.clientRequestId}:${input.snippetId}`;
}

function toResearchEvidenceItem(
  item: NormalizedEvidenceItem,
): ResearchEvidenceItem {
  return {
    evidenceId: item.evidenceId,
    claimClass: item.claimClass,
    signalClass: item.signalClass,
    label: item.label,
    value: item.rawValue,
    unit: item.unit,
    countryCode: item.countryCode,
    currencyCode: item.currencyCode,
    matchQuality: item.matchQuality,
    freshnessClass: item.freshnessClass,
    confidenceClass: item.confidenceClass,
    provenance: {
      sourceId: item.sourceId,
      adapterId: item.adapterId,
      sourceUrls: item.citationUrls,
      retrievedAt: item.retrievedAt,
      observationPeriodStart: item.observationPeriodStart ?? undefined,
      observationPeriodEnd: item.observationPeriodEnd ?? undefined,
      licenseOk: item.licenseOk,
      rightsClass: "provider_output_owned",
      sourcePolicyVersion: item.sourcePolicyVersion,
    },
    permittedFields: item.permittedFields,
  };
}

function fail(
  code: ResearchFailureCode | EvidenceRejectCode,
  detail: string,
  extra?: Partial<{
    organizationId: string;
    clientRequestId: string;
    rejected: readonly RejectedEvidenceItem[];
  }>,
): NormalizationResult {
  return {
    ok: false,
    schemaVersion: MARKET_RESEARCH_NORMALIZATION_VERSION,
    code,
    detail,
    ...extra,
  };
}

/**
 * Normalize admitted adapter evidence into accepted/rejected/conflict/abstention.
 */
export function normalizeMarketResearchEvidence(
  input: NormalizeMarketResearchInput,
): NormalizationResult {
  // Reject forged untrusted scope keys early.
  if (input.untrustedHints) {
    for (const key of FORBIDDEN_SCOPE_OVERRIDE_KEYS) {
      if (input.untrustedHints[key] !== undefined) {
        return fail("FORGED_POLICY_INPUT", `Forbidden untrusted override key '${key}'`);
      }
    }
  }

  const parsed = parseResearchRequest(input.rawRequest);
  if (!parsed.ok) {
    return fail(parsed.code, parsed.detail);
  }
  const request: ResearchRequest = parsed.value;

  const scope = resolveTrustedResearchScope({
    merchantContext: input.merchantContext,
    untrustedHints: {
      ...(input.untrustedHints ?? {}),
      organizationId: request.organizationId,
      storeId: request.storeId,
      variantId: request.variantId,
    },
  });
  if (!scope.ok) {
    return fail(scope.code, scope.detail);
  }

  if (request.organizationId !== scope.scope.organizationId) {
    return fail(
      "TENANT_SCOPE_MISMATCH",
      "Request organizationId does not match MerchantContext",
      { organizationId: scope.scope.organizationId, clientRequestId: request.clientRequestId },
    );
  }

  if (request.sourcePolicyVersion !== MARKET_RESEARCH_POLICY_PIN) {
    return fail(
      "POLICY_VERSION_MISMATCH",
      `Request sourcePolicyVersion must equal '${MARKET_RESEARCH_POLICY_PIN}'`,
      {
        organizationId: scope.scope.organizationId,
        clientRequestId: request.clientRequestId,
      },
    );
  }

  const envelope = validateAdapterEnvelopeForNormalize(input.adapterResult, {
    organizationId: scope.scope.organizationId,
    clientRequestId: request.clientRequestId,
    sourcePolicyVersion: MARKET_RESEARCH_POLICY_PIN,
  });

  if (!envelope.ok) {
    if (envelope.code === "ADAPTER_FAILURE") {
      return fail(envelope.code, envelope.detail, {
        organizationId: scope.scope.organizationId,
        clientRequestId: request.clientRequestId,
        rejected: [
          {
            rejectId: "rej-adapter-failure",
            code: "ADAPTER_FAILURE",
            detail: envelope.detail,
            organizationId: scope.scope.organizationId,
            clientRequestId: request.clientRequestId,
            originClass: "synthetic_fixture",
          },
        ],
      });
    }
    return fail(envelope.code, envelope.detail, {
      organizationId: scope.scope.organizationId,
      clientRequestId: request.clientRequestId,
    });
  }

  const success = envelope.success;

  // Gemini display-only cannot enter normalization.
  if (success.sourceId === MARKET_SOURCE_IDS.GEMINI_SEARCH_GROUNDING) {
    return fail("GEMINI_NORMALIZE_DENIED", "Gemini display-only results cannot enter normalization", {
      organizationId: scope.scope.organizationId,
      clientRequestId: request.clientRequestId,
      rejected: [
        {
          rejectId: "rej-gemini-normalize",
          code: "GEMINI_NORMALIZE_DENIED",
          detail: "Gemini normalize is denied by source rights policy",
          organizationId: scope.scope.organizationId,
          clientRequestId: request.clientRequestId,
          originClass: "synthetic_fixture",
        },
      ],
    });
  }

  // Re-evaluate normalize rights — never trust envelope for authorization.
  const rights = evaluateSourceOperationRights({
    sourceId: success.sourceId,
    operation: "normalize",
    satisfiedConditions: input.satisfiedNormalizeConditions,
    asOf: input.nowIso,
    // Intentionally omit untrusted licenseOk/policy — forged input fails closed.
  });

  if (!rights.ok) {
    return fail(rights.code, rights.detail, {
      organizationId: scope.scope.organizationId,
      clientRequestId: request.clientRequestId,
    });
  }

  const licenseOk = deriveServerLicenseOk({
    sourceId: success.sourceId,
    operation: "normalize",
    satisfiedConditions: input.satisfiedNormalizeConditions,
    asOf: input.nowIso,
  });

  const rejected: RejectedEvidenceItem[] = [];
  const candidates: NormalizedEvidenceItem[] = [];

  // Envelope-level freshness (shared observation window).
  const envelopeFreshness = evaluateEvidenceFreshness({
    retrievedAt: success.retrievedAt,
    observationPeriodStart: success.observationPeriodStart,
    observationPeriodEnd: success.observationPeriodEnd,
    nowIso: input.nowIso,
    claimedFreshnessFromRetrieval: input.claimedFreshnessFromRetrieval,
  });

  if (!envelopeFreshness.ok) {
    return fail(envelopeFreshness.code, envelopeFreshness.detail, {
      organizationId: scope.scope.organizationId,
      clientRequestId: request.clientRequestId,
    });
  }

  for (const snippet of success.snippets) {
    const honesty = evaluateSnippetHonesty(snippet);
    if (!honesty.ok) {
      rejected.push({
        rejectId: `rej-honesty-${snippet.snippetId}`,
        snippetId: snippet.snippetId,
        code: honesty.code,
        detail: honesty.detail,
        organizationId: scope.scope.organizationId,
        clientRequestId: request.clientRequestId,
        originClass: "synthetic_fixture",
      });
      continue;
    }

    const citations = bindSnippetCitations({
      snippet,
      citations: success.citations,
      requireCitation: claimRequiresCitation(snippet.claimClass),
    });
    if (!citations.ok) {
      rejected.push({
        rejectId: `rej-cite-${snippet.snippetId}`,
        snippetId: snippet.snippetId,
        code: citations.code,
        detail: citations.detail,
        organizationId: scope.scope.organizationId,
        clientRequestId: request.clientRequestId,
        originClass: "synthetic_fixture",
      });
      continue;
    }

    const productMatch = matchProductAttributes({
      target: input.targetProduct,
      observed: snippet.observedProduct,
    });

    if (productMatch.quality === "mismatch") {
      rejected.push({
        rejectId: `rej-product-${snippet.snippetId}`,
        snippetId: snippet.snippetId,
        code: "PRODUCT_MISMATCH",
        detail: `Product mismatch: ${productMatch.reasons.join(",")}`,
        organizationId: scope.scope.organizationId,
        clientRequestId: request.clientRequestId,
        originClass: "synthetic_fixture",
      });
      continue;
    }

    if (
      productMatch.quality === "unknown" &&
      productMatch.reasons.includes("AMBIGUOUS_ATTRIBUTES")
    ) {
      rejected.push({
        rejectId: `rej-ambig-${snippet.snippetId}`,
        snippetId: snippet.snippetId,
        code: "PRODUCT_AMBIGUOUS",
        detail: `Ambiguous product match: ${productMatch.reasons.join(",")}`,
        organizationId: scope.scope.organizationId,
        clientRequestId: request.clientRequestId,
        originClass: "synthetic_fixture",
      });
      continue;
    }

    const geoMatch = matchGeographicObservation({
      requestedCountryCode: request.countryCode,
      requestedCurrencyCode: request.currencyCode,
      requestedUnit: input.requestedUnit,
      observed: snippet.observedGeo,
      fxRatesAuthorized: input.fxRatesAuthorized === true,
    });

    if (geoMatch.quality === "mismatch") {
      const code: EvidenceRejectCode = geoMatch.reasons.includes("CURRENCY_MISMATCH")
        ? "CURRENCY_MISMATCH"
        : geoMatch.reasons.includes("UNIT_MISMATCH")
          ? "UNIT_MISMATCH"
          : geoMatch.reasons.includes("FX_CONVERSION_UNAUTHORIZED")
            ? "FX_UNAUTHORIZED"
            : "GEO_MISMATCH";
      rejected.push({
        rejectId: `rej-geo-${snippet.snippetId}`,
        snippetId: snippet.snippetId,
        code,
        detail: `Geographic mismatch: ${geoMatch.reasons.join(",")}`,
        organizationId: scope.scope.organizationId,
        clientRequestId: request.clientRequestId,
        originClass: "synthetic_fixture",
      });
      continue;
    }

    if (geoMatch.quality === "unproven" || geoMatch.quality === "unknown") {
      rejected.push({
        rejectId: `rej-geo-unknown-${snippet.snippetId}`,
        snippetId: snippet.snippetId,
        code: geoMatch.quality === "unproven" ? "GEO_UNPROVEN" : "UNSUPPORTED_GEO",
        detail: `Geography not proven: ${geoMatch.reasons.join(",")}`,
        organizationId: scope.scope.organizationId,
        clientRequestId: request.clientRequestId,
        originClass: "synthetic_fixture",
      });
      continue;
    }

    // Historical / stale evidence may be accepted but never implies current conditions.
    const freshnessClass = envelopeFreshness.freshnessClass;
    if (
      envelopeFreshness.historicalOnly &&
      input.claimedFreshnessFromRetrieval === true
    ) {
      rejected.push({
        rejectId: `rej-stale-current-${snippet.snippetId}`,
        snippetId: snippet.snippetId,
        code: "STALE_AS_CURRENT_FORBIDDEN",
        detail: "Historical evidence cannot imply current conditions",
        organizationId: scope.scope.organizationId,
        clientRequestId: request.clientRequestId,
        originClass: "synthetic_fixture",
      });
      continue;
    }

    // Raw value: unknown ≠ zero — missing stays empty string labeled unknown path.
    const rawValue =
      typeof snippet.observedValue === "string"
        ? snippet.observedValue
        : "";
    const unit =
      snippet.observedUnit === undefined
        ? null
        : snippet.observedUnit;

    // Comparable gate: mismatch already rejected; unknown product may abstain rather than accept as strong evidence.
    const comparableProduct = isComparableMatchQuality(productMatch.quality);
    const comparableGeo = isComparableGeoQuality(geoMatch.quality);
    if (!comparableProduct) {
      // Accept as low-confidence only when partial identifiers exist; else reject as insufficient.
      if (productMatch.quality === "unknown") {
        rejected.push({
          rejectId: `rej-product-unknown-${snippet.snippetId}`,
          snippetId: snippet.snippetId,
          code: "INSUFFICIENT_EVIDENCE",
          detail: `Insufficient product identifiers: ${productMatch.reasons.join(",")}`,
          organizationId: scope.scope.organizationId,
          clientRequestId: request.clientRequestId,
          originClass: "synthetic_fixture",
        });
        continue;
      }
    }
    if (!comparableGeo) {
      rejected.push({
        rejectId: `rej-geo-incomparable-${snippet.snippetId}`,
        snippetId: snippet.snippetId,
        code: "GEO_UNPROVEN",
        detail: "Geographic observation not comparable",
        organizationId: scope.scope.organizationId,
        clientRequestId: request.clientRequestId,
        originClass: "synthetic_fixture",
      });
      continue;
    }

    const evidenceId = deterministicEvidenceId({
      organizationId: scope.scope.organizationId,
      clientRequestId: request.clientRequestId,
      snippetId: snippet.snippetId,
    });

    const independenceClass = "independent" as const;
    const confidenceClass = deriveConfidenceClass({
      matchQuality: productMatch.quality,
      freshnessClass,
      independenceClass,
      licenseOk,
    });

    const countryCode =
      geoMatch.observedCountryCode ?? request.countryCode.toUpperCase();
    const currencyCode =
      geoMatch.observedCurrencyCode ?? request.currencyCode ?? null;

    candidates.push({
      evidenceId,
      organizationId: scope.scope.organizationId,
      clientRequestId: request.clientRequestId,
      snippetId: snippet.snippetId,
      originClass: "synthetic_fixture",
      syntheticOriginPreserved: true,
      isRealMerchantOrMarketFact: false,
      claimClass: snippet.claimClass,
      signalClass: snippet.signalClass,
      label: `[${snippet.signalClass}] ${snippet.text}`,
      rawValue,
      unit,
      countryCode,
      currencyCode,
      matchQuality: productMatch.quality,
      productMatchReasons: productMatch.reasons,
      geoMatchQuality: geoMatch.quality,
      geoMatchReasons: geoMatch.reasons,
      freshnessClass,
      confidenceClass,
      retrievedAt: envelopeFreshness.retrievedAt,
      observationPeriodStart: envelopeFreshness.observationPeriodStart,
      observationPeriodEnd: envelopeFreshness.observationPeriodEnd,
      observationKnown: envelopeFreshness.observationKnown,
      sourceId: success.sourceId,
      adapterId: success.adapterId,
      sourcePolicyVersion: success.sourcePolicyVersion,
      licenseOk,
      citationUrls: citations.urls,
      permittedFields: Object.freeze([
        "evidenceId",
        "claimClass",
        "signalClass",
        "label",
        "rawValue",
        "unit",
        "countryCode",
        "currencyCode",
        "matchQuality",
        "freshnessClass",
        "citationUrls",
        "originClass",
      ]),
      independenceClass,
    });
  }

  const deduped = dedupeAndDetectConflicts({
    items: candidates,
    organizationId: scope.scope.organizationId,
    clientRequestId: request.clientRequestId,
    adapterConflictHints: success.conflicts,
  });

  const allRejected = Object.freeze([...rejected, ...deduped.rejected]);
  const accepted = deduped.accepted;
  const researchEvidence = Object.freeze(
    accepted.map(toResearchEvidenceItem),
  );

  const abstentions =
    accepted.length === 0
      ? Object.freeze([
          {
            code: "INSUFFICIENT_EVIDENCE" as const,
            detail: "No evidence items accepted after normalization",
          },
        ])
      : Object.freeze([]);

  return {
    ok: true,
    schemaVersion: MARKET_RESEARCH_NORMALIZATION_VERSION,
    originClass: "synthetic_fixture",
    organizationId: scope.scope.organizationId,
    clientRequestId: request.clientRequestId,
    sourceId: success.sourceId,
    adapterId: success.adapterId,
    sourcePolicyVersion: success.sourcePolicyVersion,
    nowIso: input.nowIso,
    accepted,
    rejected: allRejected,
    conflicts: deduped.conflicts,
    abstentions,
    researchEvidence,
  };
}
