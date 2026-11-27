/**
 * AI-MKT-1b — synthetic fixture catalog (no real provider content).
 * All payloads are labeled synthetic_fixture and never real merchant/market facts.
 */

import {
  MARKET_ADAPTER_IDS,
  MARKET_RESEARCH_POLICY_PIN,
  MARKET_SOURCE_IDS,
} from "@/lib/market-research/types";
import {
  MARKET_RESEARCH_ADAPTER_RESPONSE_VERSION,
  type GeminiOfflineFixtureId,
  type MarketResearchAdapterResult,
  type MarketResearchAdapterSnippet,
  type MarketResearchAdapterSuccess,
  type OpenAiOfflineFixtureId,
} from "@/lib/market-research/adapters/types";

function snippet(
  partial: Omit<MarketResearchAdapterSnippet, "isRealMerchantOrMarketFact">,
): MarketResearchAdapterSnippet {
  return { ...partial, isRealMerchantOrMarketFact: false };
}

export type FixtureBuildContext = {
  clientRequestId: string;
  organizationId: string;
  countryCode: string;
  retrievedAt: string;
};

function baseOpenAiSuccess(
  ctx: FixtureBuildContext,
  fixtureId: OpenAiOfflineFixtureId,
  mode: "offline_stub" | "recorded_replay",
): Omit<MarketResearchAdapterSuccess, "citations" | "snippets" | "conflicts" | "syntheticLabel"> {
  return {
    ok: true,
    schemaVersion: MARKET_RESEARCH_ADAPTER_RESPONSE_VERSION,
    originClass: "synthetic_fixture",
    fixtureId,
    sourceId: MARKET_SOURCE_IDS.OPENAI_WEB_SEARCH,
    adapterId: MARKET_ADAPTER_IDS.OPENAI_WEB_SEARCH,
    mode,
    providerShape: "openai_responses_web_search_v1",
    sourcePolicyVersion: MARKET_RESEARCH_POLICY_PIN,
    clientRequestId: ctx.clientRequestId,
    organizationId: ctx.organizationId,
    retrievedAt: ctx.retrievedAt,
    // Observation deliberately omitted unless fixture sets it —
    // retrieval ≠ observation.
    latencyMs: 1,
  };
}

/**
 * Build a deterministic OpenAI-shaped synthetic result for a named fixture.
 * Shapes mimic Responses/web_search citation envelopes without SDK payloads.
 */
export function buildOpenAiOfflineFixture(
  fixtureId: OpenAiOfflineFixtureId,
  ctx: FixtureBuildContext,
  mode: "offline_stub" | "recorded_replay" = "offline_stub",
): MarketResearchAdapterResult {
  switch (fixtureId) {
    case "openai_success_citations_v1": {
      return {
        ...baseOpenAiSuccess(ctx, fixtureId, mode),
        syntheticLabel: "SYNTHETIC_OPENAI_WEB_SEARCH_SUCCESS",
        observationPeriodStart: "2026-11-20T00:00:00.000Z",
        observationPeriodEnd: "2026-11-20T23:59:59.000Z",
        attributionText: "Synthetic citations for offline fixture only",
        citations: [
          {
            url: "https://fixture.example/listings/blender-ae",
            title: "SYNTHETIC listing page (not real)",
          },
          {
            url: "https://fixture.example/reviews/blender-ae",
            title: "SYNTHETIC review aggregate (not real)",
          },
        ],
        snippets: [
          snippet({
            snippetId: "oa-s1",
            text: "SYNTHETIC: Public listing describes a 500W kitchen blender sold in AE.",
            signalClass: "public_listing",
            claimClass: "sourced_signal",
            observedValue: "listed",
            observedUnit: null,
            observedProduct: {
              brand: "BlendCo",
              model: "BC-500",
              gtin: "1234567890123",
              mpn: "BC500-AE",
              variant: "500W-black",
              size: "standard",
              color: "black",
              capacity: "500W",
              packQuantity: 1,
              condition: "new",
              category: "kitchen_appliances",
              role: "product",
              title: "BlendCo BC-500 500W Kitchen Blender",
            },
            observedGeo: {
              countryCode: "AE",
              currencyCode: "AED",
              geoProofClass: "explicit_market",
            },
            supportingCitationIndexes: [0],
          }),
          snippet({
            snippetId: "oa-s2",
            text: "SYNTHETIC: Review text mentions color options; not verified sales.",
            signalClass: "public_review",
            claimClass: "sourced_signal",
            observedValue: "4.2",
            observedUnit: "stars",
            observedProduct: {
              brand: "BlendCo",
              model: "BC-500",
              color: "black",
              category: "kitchen_appliances",
              role: "product",
              title: "BlendCo BC-500",
            },
            observedGeo: {
              countryCode: "AE",
              currencyCode: "AED",
              geoProofClass: "explicit_market",
            },
            supportingCitationIndexes: [1],
          }),
        ],
        conflicts: [],
      };
    }
    case "openai_empty_results_v1": {
      return {
        ok: false,
        schemaVersion: MARKET_RESEARCH_ADAPTER_RESPONSE_VERSION,
        originClass: "synthetic_fixture",
        reason: "EMPTY_RESULTS",
        detail: "Synthetic OpenAI fixture returned no web_search results",
        sourceId: MARKET_SOURCE_IDS.OPENAI_WEB_SEARCH,
        adapterId: MARKET_ADAPTER_IDS.OPENAI_WEB_SEARCH,
        mode,
        fixtureId,
        clientRequestId: ctx.clientRequestId,
        organizationId: ctx.organizationId,
        researchCode: "INSUFFICIENT_EVIDENCE",
        latencyMs: 1,
      };
    }
    case "openai_malformed_response_v1": {
      return {
        ok: false,
        schemaVersion: MARKET_RESEARCH_ADAPTER_RESPONSE_VERSION,
        originClass: "synthetic_fixture",
        reason: "MALFORMED_PROVIDER_RESPONSE",
        detail: "Synthetic OpenAI fixture encodes a malformed Responses payload",
        sourceId: MARKET_SOURCE_IDS.OPENAI_WEB_SEARCH,
        adapterId: MARKET_ADAPTER_IDS.OPENAI_WEB_SEARCH,
        mode,
        fixtureId,
        clientRequestId: ctx.clientRequestId,
        organizationId: ctx.organizationId,
        researchCode: "MALFORMED_REQUEST",
        latencyMs: 1,
      };
    }
    case "openai_conflicting_signals_v1": {
      return {
        ...baseOpenAiSuccess(ctx, fixtureId, mode),
        syntheticLabel: "SYNTHETIC_OPENAI_CONFLICTING_SIGNALS",
        observationPeriodEnd: "2026-11-15T00:00:00.000Z",
        citations: [
          {
            url: "https://fixture.example/a",
            title: "SYNTHETIC source A",
          },
          {
            url: "https://fixture.example/b",
            title: "SYNTHETIC source B",
          },
        ],
        snippets: [
          snippet({
            snippetId: "oa-c1",
            text: "SYNTHETIC: Source A describes the item as in-stock online.",
            signalClass: "public_listing",
            claimClass: "sourced_signal",
            observedValue: "in_stock",
            observedProduct: {
              brand: "BlendCo",
              model: "BC-500",
              gtin: "1234567890123",
              packQuantity: 1,
              condition: "new",
              category: "kitchen_appliances",
              role: "product",
            },
            observedGeo: {
              countryCode: "AE",
              currencyCode: "AED",
              geoProofClass: "explicit_market",
            },
            supportingCitationIndexes: [0],
          }),
          snippet({
            snippetId: "oa-c2",
            text: "SYNTHETIC: Source B describes the item as discontinued online.",
            signalClass: "public_listing",
            claimClass: "sourced_signal",
            observedValue: "discontinued",
            observedProduct: {
              brand: "BlendCo",
              model: "BC-500",
              gtin: "1234567890123",
              packQuantity: 1,
              condition: "new",
              category: "kitchen_appliances",
              role: "product",
            },
            observedGeo: {
              countryCode: "AE",
              currencyCode: "AED",
              geoProofClass: "explicit_market",
            },
            supportingCitationIndexes: [1],
          }),
        ],
        conflicts: [
          {
            conflictId: "oa-conflict-1",
            snippetIds: ["oa-c1", "oa-c2"],
            summary:
              "SYNTHETIC conflict: listing availability signals disagree — do not invent consensus",
          },
        ],
      };
    }
    case "openai_missing_provenance_v1": {
      return {
        ok: false,
        schemaVersion: MARKET_RESEARCH_ADAPTER_RESPONSE_VERSION,
        originClass: "synthetic_fixture",
        reason: "MISSING_PROVENANCE",
        detail: "Synthetic OpenAI fixture omitted provenance / source policy pin",
        sourceId: MARKET_SOURCE_IDS.OPENAI_WEB_SEARCH,
        adapterId: MARKET_ADAPTER_IDS.OPENAI_WEB_SEARCH,
        mode,
        fixtureId,
        clientRequestId: ctx.clientRequestId,
        organizationId: ctx.organizationId,
        researchCode: "INSUFFICIENT_EVIDENCE",
        latencyMs: 1,
      };
    }
    case "openai_missing_citations_v1": {
      return {
        ok: false,
        schemaVersion: MARKET_RESEARCH_ADAPTER_RESPONSE_VERSION,
        originClass: "synthetic_fixture",
        reason: "MISSING_CITATIONS",
        detail: "Synthetic OpenAI fixture returned text without citation URLs",
        sourceId: MARKET_SOURCE_IDS.OPENAI_WEB_SEARCH,
        adapterId: MARKET_ADAPTER_IDS.OPENAI_WEB_SEARCH,
        mode,
        fixtureId,
        clientRequestId: ctx.clientRequestId,
        organizationId: ctx.organizationId,
        researchCode: "ATTRIBUTION_REQUIRED",
        latencyMs: 1,
      };
    }
    case "openai_timeout_v1": {
      return {
        ok: false,
        schemaVersion: MARKET_RESEARCH_ADAPTER_RESPONSE_VERSION,
        originClass: "synthetic_fixture",
        reason: "TIMEOUT",
        detail: "Synthetic OpenAI fixture simulated provider timeout",
        sourceId: MARKET_SOURCE_IDS.OPENAI_WEB_SEARCH,
        adapterId: MARKET_ADAPTER_IDS.OPENAI_WEB_SEARCH,
        mode,
        fixtureId,
        clientRequestId: ctx.clientRequestId,
        organizationId: ctx.organizationId,
        researchCode: "TIMEOUT",
        latencyMs: 1,
      };
    }
    case "openai_transient_failure_v1": {
      return {
        ok: false,
        schemaVersion: MARKET_RESEARCH_ADAPTER_RESPONSE_VERSION,
        originClass: "synthetic_fixture",
        reason: "TRANSIENT",
        detail: "Synthetic OpenAI fixture simulated transient provider error",
        sourceId: MARKET_SOURCE_IDS.OPENAI_WEB_SEARCH,
        adapterId: MARKET_ADAPTER_IDS.OPENAI_WEB_SEARCH,
        mode,
        fixtureId,
        clientRequestId: ctx.clientRequestId,
        organizationId: ctx.organizationId,
        researchCode: "TRANSIENT",
        latencyMs: 1,
      };
    }
    case "openai_hang_until_abort_v1":
    case "openai_late_response_v1": {
      // Handled by adapter runtime (abort / late discard), not static build.
      return {
        ok: false,
        schemaVersion: MARKET_RESEARCH_ADAPTER_RESPONSE_VERSION,
        originClass: "synthetic_fixture",
        reason: "TRANSIENT",
        detail: `Fixture '${fixtureId}' requires adapter runtime handling`,
        fixtureId,
        latencyMs: 0,
      };
    }
    default: {
      const _exhaustive: never = fixtureId;
      return {
        ok: false,
        schemaVersion: MARKET_RESEARCH_ADAPTER_RESPONSE_VERSION,
        originClass: "synthetic_fixture",
        reason: "MALFORMED_PROVIDER_RESPONSE",
        detail: `Unknown OpenAI fixture '${String(_exhaustive)}'`,
        latencyMs: 0,
      };
    }
  }
}

export function buildGeminiOfflineFixture(
  fixtureId: GeminiOfflineFixtureId,
  ctx: FixtureBuildContext,
  mode: "offline_stub" | "recorded_replay" = "offline_stub",
): MarketResearchAdapterResult {
  const baseMeta = {
    sourceId: MARKET_SOURCE_IDS.GEMINI_SEARCH_GROUNDING,
    adapterId: MARKET_ADAPTER_IDS.GEMINI_SEARCH_GROUNDING,
    mode,
    fixtureId,
    clientRequestId: ctx.clientRequestId,
    organizationId: ctx.organizationId,
  } as const;

  switch (fixtureId) {
    case "gemini_display_only_success_v1": {
      return {
        ok: true,
        schemaVersion: MARKET_RESEARCH_ADAPTER_RESPONSE_VERSION,
        originClass: "synthetic_fixture",
        syntheticLabel: "SYNTHETIC_GEMINI_DISPLAY_ONLY_SUCCESS",
        fixtureId,
        sourceId: MARKET_SOURCE_IDS.GEMINI_SEARCH_GROUNDING,
        adapterId: MARKET_ADAPTER_IDS.GEMINI_SEARCH_GROUNDING,
        mode,
        providerShape: "gemini_search_grounding_v1",
        sourcePolicyVersion: MARKET_RESEARCH_POLICY_PIN,
        clientRequestId: ctx.clientRequestId,
        organizationId: ctx.organizationId,
        retrievedAt: ctx.retrievedAt,
        // No observation window — unknown ≠ current.
        citations: [
          {
            url: "https://fixture.example/gemini/display-only",
            title: "SYNTHETIC grounded citation (not real)",
          },
        ],
        snippets: [
          snippet({
            snippetId: "gm-s1",
            text: "SYNTHETIC Gemini display-only grounded snippet — not warehouse evidence.",
            signalClass: "other_sourced",
            claimClass: "sourced_signal",
          }),
        ],
        conflicts: [],
        searchSuggestionsRef: "synthetic-search-suggestions-blob-ref-v1",
        attributionText:
          "SYNTHETIC: Search Suggestions must render with Grounded Results",
        latencyMs: 1,
      };
    }
    case "gemini_missing_search_suggestions_v1": {
      return {
        ok: false,
        schemaVersion: MARKET_RESEARCH_ADAPTER_RESPONSE_VERSION,
        originClass: "synthetic_fixture",
        reason: "MISSING_CITATIONS",
        detail:
          "Synthetic Gemini fixture missing Search Suggestions (attribution required)",
        ...baseMeta,
        researchCode: "ATTRIBUTION_REQUIRED",
        latencyMs: 1,
      };
    }
    case "gemini_empty_results_v1": {
      return {
        ok: false,
        schemaVersion: MARKET_RESEARCH_ADAPTER_RESPONSE_VERSION,
        originClass: "synthetic_fixture",
        reason: "EMPTY_RESULTS",
        detail: "Synthetic Gemini fixture returned empty grounded results",
        ...baseMeta,
        researchCode: "INSUFFICIENT_EVIDENCE",
        latencyMs: 1,
      };
    }
    case "gemini_timeout_v1": {
      return {
        ok: false,
        schemaVersion: MARKET_RESEARCH_ADAPTER_RESPONSE_VERSION,
        originClass: "synthetic_fixture",
        reason: "TIMEOUT",
        detail: "Synthetic Gemini fixture simulated timeout",
        ...baseMeta,
        researchCode: "TIMEOUT",
        latencyMs: 1,
      };
    }
    case "gemini_hang_until_abort_v1": {
      return {
        ok: false,
        schemaVersion: MARKET_RESEARCH_ADAPTER_RESPONSE_VERSION,
        originClass: "synthetic_fixture",
        reason: "TRANSIENT",
        detail: "Fixture requires adapter runtime abort handling",
        ...baseMeta,
        latencyMs: 0,
      };
    }
    default: {
      const _exhaustive: never = fixtureId;
      return {
        ok: false,
        schemaVersion: MARKET_RESEARCH_ADAPTER_RESPONSE_VERSION,
        originClass: "synthetic_fixture",
        reason: "MALFORMED_PROVIDER_RESPONSE",
        detail: `Unknown Gemini fixture '${String(_exhaustive)}'`,
        latencyMs: 0,
      };
    }
  }
}

/** Assert a success envelope never claims real merchant/market facts. */
export function assertSyntheticOnly(
  result: MarketResearchAdapterResult,
): boolean {
  if (!result.ok) {
    return result.originClass === "synthetic_fixture";
  }
  if (result.originClass !== "synthetic_fixture") {
    return false;
  }
  return result.snippets.every(
    (snippet) => snippet.isRealMerchantOrMarketFact === false,
  );
}

/**
 * AI-MKT-1c test helper — build a synthetic OpenAI success envelope with
 * caller-supplied snippets/citations. Still always synthetic_fixture.
 */
export function buildSyntheticOpenAiSuccessEnvelope(input: {
  ctx: FixtureBuildContext;
  snippets: readonly MarketResearchAdapterSnippet[];
  citations?: MarketResearchAdapterSuccess["citations"];
  conflicts?: MarketResearchAdapterSuccess["conflicts"];
  observationPeriodStart?: string;
  observationPeriodEnd?: string;
  fixtureId?: string;
  mode?: "offline_stub" | "recorded_replay";
}): MarketResearchAdapterSuccess {
  return {
    ok: true,
    schemaVersion: MARKET_RESEARCH_ADAPTER_RESPONSE_VERSION,
    originClass: "synthetic_fixture",
    syntheticLabel: "SYNTHETIC_OPENAI_CUSTOM_ENVELOPE",
    fixtureId: input.fixtureId ?? "openai_success_citations_v1",
    sourceId: MARKET_SOURCE_IDS.OPENAI_WEB_SEARCH,
    adapterId: MARKET_ADAPTER_IDS.OPENAI_WEB_SEARCH,
    mode: input.mode ?? "offline_stub",
    providerShape: "openai_responses_web_search_v1",
    sourcePolicyVersion: MARKET_RESEARCH_POLICY_PIN,
    clientRequestId: input.ctx.clientRequestId,
    organizationId: input.ctx.organizationId,
    retrievedAt: input.ctx.retrievedAt,
    observationPeriodStart: input.observationPeriodStart,
    observationPeriodEnd: input.observationPeriodEnd,
    attributionText: "Synthetic custom envelope for offline normalization tests",
    citations: input.citations ?? [
      {
        url: "https://fixture.example/listings/blender-ae",
        title: "SYNTHETIC listing page (not real)",
      },
    ],
    snippets: input.snippets.map((s) => ({
      ...s,
      isRealMerchantOrMarketFact: false as const,
    })),
    conflicts: input.conflicts ?? [],
    latencyMs: 1,
  };
}
