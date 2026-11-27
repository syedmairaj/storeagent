import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { buildTrustedMerchantContext } from "@/lib/commerce-agent";
import {
  MARKET_ADAPTER_IDS,
  MARKET_RESEARCH_POLICY_PIN,
  MARKET_RESEARCH_REQUEST_VERSION,
  MARKET_SOURCE_IDS,
  assertSyntheticOnly,
  createOpenAiOfflineStubAdapter,
  createOpenAiRecordedReplayAdapter,
  evaluateSourceOperationRights,
  geminiAutomaticFallbackAllowed,
  invokeMarketResearchAdapter,
  listOfflineAdapterRegistryKeys,
  openaiCandidateApprovalImpliesLiveRights,
  openaiDesignCandidateImpliesLiveApproval,
  resolveOfflineResearchAdapter,
} from "@/lib/market-research";

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG = "99999999-9999-4999-8999-999999999999";
const STORE = "22222222-2222-4222-8222-222222222222";

function trustedContext(overrides?: { organizationId?: string }) {
  return buildTrustedMerchantContext({
    userId: "user-1",
    organizationId: overrides?.organizationId ?? ORG,
    role: "owner",
    permissions: ["inventory.read", "stores.read"],
    storeId: STORE,
    countryCode: "AE",
    currencyCode: "AED",
    asOf: "2026-11-27T12:00:00.000Z",
  });
}

function validRequest(overrides?: Record<string, unknown>) {
  return {
    schemaVersion: MARKET_RESEARCH_REQUEST_VERSION,
    clientRequestId: "req-mkt-1b",
    organizationId: ORG,
    storeId: STORE,
    countryCode: "AE",
    currencyCode: "AED",
    depth: "quick_lookup",
    intentClass: "market_opportunity",
    question: "SYNTHETIC offline research question (not live)",
    sourcePolicyVersion: MARKET_RESEARCH_POLICY_PIN,
    allowAdapters: [
      MARKET_ADAPTER_IDS.OPENAI_WEB_SEARCH,
      MARKET_ADAPTER_IDS.GEMINI_SEARCH_GROUNDING,
    ],
    ...overrides,
  };
}

const OPENAI_RETRIEVE_CONDITIONS = [
  "live_research_authorized",
  "third_party_source_rights_reviewed",
  "credit_reservation_ok",
] as const;

const GEMINI_RETRIEVE_CONDITIONS = [
  "live_research_authorized",
  "display_only_path",
  "search_suggestions_renderable",
  "no_automatic_fallback",
] as const;

describe("AI-MKT-1b offline adapters & fixtures", () => {
  describe("adapter registry & live rejection", () => {
    it("lists only offline_stub / recorded_replay registry keys", () => {
      const keys = listOfflineAdapterRegistryKeys();
      expect(keys).toEqual([
        "openai_offline_stub",
        "openai_recorded_replay",
        "gemini_offline_stub",
        "gemini_recorded_replay",
      ]);
    });

    it("resolves offline adapters with supportsLiveNetwork=false", () => {
      const resolved = resolveOfflineResearchAdapter({
        registryKey: "openai_offline_stub",
      });
      expect(resolved.ok).toBe(true);
      if (!resolved.ok) return;
      expect(resolved.adapter.supportsLiveNetwork).toBe(false);
      expect(resolved.adapter.mode).toBe("offline_stub");
      expect(resolved.adapter.originClass).toBe("synthetic_fixture");
    });

    it("rejects unknown, forged, and live adapters at runtime", async () => {
      const unknown = resolveOfflineResearchAdapter({
        registryKey: "not_a_real_adapter",
      });
      expect(unknown.ok).toBe(false);
      if (!unknown.ok) expect(unknown.reason).toBe("ADAPTER_UNKNOWN");

      const forged = resolveOfflineResearchAdapter({
        untrustedAdapter: {
          adapterId: "openai_web_search_v1",
          supportsLiveNetwork: false,
          mode: "offline_stub",
        },
      });
      expect(forged.ok).toBe(false);
      if (!forged.ok) expect(forged.reason).toBe("ADAPTER_FORGED");

      const live = resolveOfflineResearchAdapter({
        untrustedAdapter: {
          adapterId: "live_provider",
          supportsLiveNetwork: true,
          mode: "live_provider",
        },
      });
      expect(live.ok).toBe(false);
      if (!live.ok) expect(live.reason).toBe("LIVE_PROVIDER_FORBIDDEN");

      const invokedLive = await invokeMarketResearchAdapter({
        merchantContext: trustedContext(),
        rawRequest: validRequest(),
        sourceId: MARKET_SOURCE_IDS.OPENAI_WEB_SEARCH,
        operation: "retrieve",
        allowSyntheticFixtures: true,
        requestLiveNetwork: true,
        satisfiedConditions: [...OPENAI_RETRIEVE_CONDITIONS],
      });
      expect(invokedLive.adaptersInvoked).toBe(0);
      expect(invokedLive.result.ok).toBe(false);
      if (!invokedLive.result.ok) {
        expect(invokedLive.result.reason).toBe("LIVE_PROVIDER_FORBIDDEN");
      }
    });
  });

  describe("synthetic OpenAI success & deterministic replay", () => {
    it("returns synthetic success with citations via offline_stub", async () => {
      const invoked = await invokeMarketResearchAdapter({
        merchantContext: trustedContext(),
        rawRequest: validRequest(),
        sourceId: MARKET_SOURCE_IDS.OPENAI_WEB_SEARCH,
        operation: "retrieve",
        registryKey: "openai_offline_stub",
        fixtureId: "openai_success_citations_v1",
        allowSyntheticFixtures: true,
        satisfiedConditions: [...OPENAI_RETRIEVE_CONDITIONS],
      });

      expect(invoked.adaptersInvoked).toBe(1);
      expect(invoked.admissionDenied).toBe(false);
      expect(invoked.result.ok).toBe(true);
      if (!invoked.result.ok) return;

      expect(invoked.result.originClass).toBe("synthetic_fixture");
      expect(invoked.result.providerShape).toBe(
        "openai_responses_web_search_v1",
      );
      expect(invoked.result.citations.length).toBeGreaterThan(0);
      expect(invoked.result.snippets.every((s) => !s.isRealMerchantOrMarketFact)).toBe(
        true,
      );
      expect(assertSyntheticOnly(invoked.result)).toBe(true);
      // Observation window present and distinct from treating retrieval as fact.
      expect(invoked.result.observationPeriodEnd).toBeTruthy();
      expect(invoked.result.retrievedAt).toBe("2026-11-27T12:00:00.000Z");
    });

    it("recorded_replay is deterministic across invocations", async () => {
      const a = createOpenAiRecordedReplayAdapter({
        fixtureId: "openai_success_citations_v1",
      });
      const b = createOpenAiRecordedReplayAdapter({
        fixtureId: "openai_success_citations_v1",
      });
      expect(a.mode).toBe("recorded_replay");
      expect(a.supportsLiveNetwork).toBe(false);

      const signal = new AbortController().signal;
      const opts = {
        signal,
        timeoutMs: 50,
        nowIso: "2026-11-27T12:00:00.000Z",
      };
      const input = {
        clientRequestId: "replay-1",
        organizationId: ORG,
        countryCode: "AE",
        question: "q",
        sourcePolicyVersion: MARKET_RESEARCH_POLICY_PIN,
      };

      const r1 = await a.research(input, opts);
      const r2 = await b.research(input, opts);
      expect(r1).toEqual(r2);
      expect(r1.ok).toBe(true);
    });
  });

  describe("policy / tenant / geo denial before invocation", () => {
    it("denies disabled research with zero adapters invoked", async () => {
      const invoked = await invokeMarketResearchAdapter({
        merchantContext: trustedContext(),
        rawRequest: validRequest(),
        sourceId: MARKET_SOURCE_IDS.OPENAI_WEB_SEARCH,
        operation: "retrieve",
        registryKey: "openai_offline_stub",
        // allowSyntheticFixtures omitted → RESEARCH_DISABLED
        satisfiedConditions: [...OPENAI_RETRIEVE_CONDITIONS],
      });
      expect(invoked.adaptersInvoked).toBe(0);
      expect(invoked.admissionDenied).toBe(true);
      if (!invoked.result.ok) {
        expect(invoked.result.reason).toBe("RESEARCH_DISABLED");
      }
    });

    it("denies tenant mismatch before adapter call", async () => {
      const invoked = await invokeMarketResearchAdapter({
        merchantContext: trustedContext(),
        rawRequest: validRequest({ organizationId: OTHER_ORG }),
        sourceId: MARKET_SOURCE_IDS.OPENAI_WEB_SEARCH,
        operation: "retrieve",
        registryKey: "openai_offline_stub",
        allowSyntheticFixtures: true,
        satisfiedConditions: [...OPENAI_RETRIEVE_CONDITIONS],
      });
      expect(invoked.adaptersInvoked).toBe(0);
      if (!invoked.result.ok) {
        expect(invoked.result.reason).toBe("TENANT_SCOPE_MISMATCH");
      }
    });

    it("denies unsupported geo before adapter call", async () => {
      const invoked = await invokeMarketResearchAdapter({
        merchantContext: trustedContext(),
        rawRequest: validRequest({ countryCode: "SA" }),
        sourceId: MARKET_SOURCE_IDS.OPENAI_WEB_SEARCH,
        operation: "retrieve",
        registryKey: "openai_offline_stub",
        allowSyntheticFixtures: true,
        satisfiedConditions: [...OPENAI_RETRIEVE_CONDITIONS],
      });
      expect(invoked.adaptersInvoked).toBe(0);
      if (!invoked.result.ok) {
        expect(invoked.result.reason).toBe("UNSUPPORTED_GEO");
      }
    });

    it("denies category without owner authorization before adapter call", async () => {
      const invoked = await invokeMarketResearchAdapter({
        merchantContext: trustedContext(),
        rawRequest: validRequest({ categoryHint: "home_kitchen" }),
        sourceId: MARKET_SOURCE_IDS.OPENAI_WEB_SEARCH,
        operation: "retrieve",
        registryKey: "openai_offline_stub",
        allowSyntheticFixtures: true,
        satisfiedConditions: [...OPENAI_RETRIEVE_CONDITIONS],
      });
      expect(invoked.adaptersInvoked).toBe(0);
      if (!invoked.result.ok) {
        expect(invoked.result.reason).toBe("UNSUPPORTED_CATEGORY");
      }
    });

    it("denies insufficient OpenAI rights conditions before adapter call", async () => {
      const invoked = await invokeMarketResearchAdapter({
        merchantContext: trustedContext(),
        rawRequest: validRequest(),
        sourceId: MARKET_SOURCE_IDS.OPENAI_WEB_SEARCH,
        operation: "retrieve",
        registryKey: "openai_offline_stub",
        allowSyntheticFixtures: true,
        satisfiedConditions: ["third_party_source_rights_reviewed"],
      });
      expect(invoked.adaptersInvoked).toBe(0);
      if (!invoked.result.ok) {
        expect(invoked.result.reason).toBe("RIGHTS_CONDITIONS_UNSATISFIED");
      }
    });
  });

  describe("OpenAI candidate ≠ live rights", () => {
    it("keeps design-candidate approval from implying live rights", () => {
      expect(openaiCandidateApprovalImpliesLiveRights()).toBe(false);
      expect(openaiDesignCandidateImpliesLiveApproval()).toBe(false);

      // Conditional retrieve rights still require explicit conditions.
      const rights = evaluateSourceOperationRights({
        sourceId: MARKET_SOURCE_IDS.OPENAI_WEB_SEARCH,
        operation: "retrieve",
      });
      expect(rights.ok).toBe(false);
    });
  });

  describe("Gemini restricted operations & no automatic fallback", () => {
    it("denies Gemini warehouse normalize/cache/analyze/model_process with zero invokes", async () => {
      for (const operation of [
        "normalize",
        "analyze",
        "model_process",
        "cache",
      ] as const) {
        const invoked = await invokeMarketResearchAdapter({
          merchantContext: trustedContext(),
          rawRequest: validRequest(),
          sourceId: MARKET_SOURCE_IDS.GEMINI_SEARCH_GROUNDING,
          operation,
          registryKey: "gemini_offline_stub",
          allowSyntheticFixtures: true,
          satisfiedConditions: [...GEMINI_RETRIEVE_CONDITIONS],
        });
        expect(invoked.adaptersInvoked).toBe(0);
        expect(invoked.admissionDenied).toBe(true);
        if (!invoked.result.ok) {
          expect(
            invoked.result.reason === "LICENSE_DENIED" ||
              invoked.result.reason === "CACHE_FORBIDDEN" ||
              invoked.result.reason === "POLICY_DENIED",
          ).toBe(true);
        }
      }
    });

    it("allows Gemini display-only retrieve fixture when rights conditions satisfied", async () => {
      const invoked = await invokeMarketResearchAdapter({
        merchantContext: trustedContext(),
        rawRequest: validRequest(),
        sourceId: MARKET_SOURCE_IDS.GEMINI_SEARCH_GROUNDING,
        operation: "retrieve",
        registryKey: "gemini_offline_stub",
        fixtureId: "gemini_display_only_success_v1",
        allowSyntheticFixtures: true,
        satisfiedConditions: [...GEMINI_RETRIEVE_CONDITIONS],
      });
      expect(invoked.adaptersInvoked).toBe(1);
      expect(invoked.result.ok).toBe(true);
      if (!invoked.result.ok) return;
      expect(invoked.result.searchSuggestionsRef).toBeTruthy();
      expect(invoked.result.snippets[0]?.isRealMerchantOrMarketFact).toBe(
        false,
      );
    });

    it("forbids automatic Gemini fallback by default", async () => {
      expect(geminiAutomaticFallbackAllowed()).toBe(false);

      const invoked = await invokeMarketResearchAdapter({
        merchantContext: trustedContext(),
        rawRequest: validRequest(),
        sourceId: MARKET_SOURCE_IDS.OPENAI_WEB_SEARCH,
        operation: "retrieve",
        registryKey: "openai_offline_stub",
        allowSyntheticFixtures: true,
        requestAutomaticFallback: true,
        satisfiedConditions: [...OPENAI_RETRIEVE_CONDITIONS],
      });
      expect(invoked.adaptersInvoked).toBe(0);
      if (!invoked.result.ok) {
        expect(invoked.result.reason).toBe("AUTOMATIC_FALLBACK_FORBIDDEN");
      }
    });
  });

  describe("malformed / empty / missing provenance / timeout / cancel / late", () => {
    it("classifies empty, malformed, missing citations, missing provenance", async () => {
      for (const fixtureId of [
        "openai_empty_results_v1",
        "openai_malformed_response_v1",
        "openai_missing_citations_v1",
        "openai_missing_provenance_v1",
        "openai_transient_failure_v1",
      ] as const) {
        const invoked = await invokeMarketResearchAdapter({
          merchantContext: trustedContext(),
          rawRequest: validRequest(),
          sourceId: MARKET_SOURCE_IDS.OPENAI_WEB_SEARCH,
          operation: "retrieve",
          registryKey: "openai_offline_stub",
          fixtureId,
          allowSyntheticFixtures: true,
          satisfiedConditions: [...OPENAI_RETRIEVE_CONDITIONS],
        });
        expect(invoked.adaptersInvoked).toBe(1);
        expect(invoked.result.ok).toBe(false);
        if (!invoked.result.ok) {
          expect(invoked.result.originClass).toBe("synthetic_fixture");
        }
      }
    });

    it("surfaces conflicting signals without inventing consensus facts", async () => {
      const invoked = await invokeMarketResearchAdapter({
        merchantContext: trustedContext(),
        rawRequest: validRequest(),
        sourceId: MARKET_SOURCE_IDS.OPENAI_WEB_SEARCH,
        operation: "retrieve",
        registryKey: "openai_offline_stub",
        fixtureId: "openai_conflicting_signals_v1",
        allowSyntheticFixtures: true,
        satisfiedConditions: [...OPENAI_RETRIEVE_CONDITIONS],
      });
      expect(invoked.result.ok).toBe(true);
      if (!invoked.result.ok) return;
      expect(invoked.result.conflicts.length).toBe(1);
      expect(
        invoked.result.snippets.every((s) => s.isRealMerchantOrMarketFact === false),
      ).toBe(true);
    });

    it("handles timeout fixture", async () => {
      const invoked = await invokeMarketResearchAdapter({
        merchantContext: trustedContext(),
        rawRequest: validRequest(),
        sourceId: MARKET_SOURCE_IDS.OPENAI_WEB_SEARCH,
        operation: "retrieve",
        registryKey: "openai_offline_stub",
        fixtureId: "openai_timeout_v1",
        allowSyntheticFixtures: true,
        satisfiedConditions: [...OPENAI_RETRIEVE_CONDITIONS],
        timeoutMs: 10,
      });
      expect(invoked.adaptersInvoked).toBe(1);
      expect(invoked.result.ok).toBe(false);
      if (!invoked.result.ok) {
        expect(invoked.result.reason).toBe("TIMEOUT");
      }
    });

    it("handles cancellation via AbortSignal", async () => {
      const controller = new AbortController();
      controller.abort();
      const adapter = createOpenAiOfflineStubAdapter({
        fixtureId: "openai_hang_until_abort_v1",
      });
      const result = await adapter.research(
        {
          clientRequestId: "abort-1",
          organizationId: ORG,
          countryCode: "AE",
          question: "q",
          sourcePolicyVersion: MARKET_RESEARCH_POLICY_PIN,
        },
        { signal: controller.signal, timeoutMs: 100 },
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("CANCELLED");
    });

    it("discards late responses after deadline", async () => {
      const adapter = createOpenAiOfflineStubAdapter({
        fixtureId: "openai_late_response_v1",
      });
      const result = await adapter.research(
        {
          clientRequestId: "late-1",
          organizationId: ORG,
          countryCode: "AE",
          question: "q",
          sourcePolicyVersion: MARKET_RESEARCH_POLICY_PIN,
        },
        {
          signal: new AbortController().signal,
          timeoutMs: 5,
        },
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("LATE_RESPONSE_DISCARDED");
    });
  });

  describe("synthetic never represented as real facts; no network", () => {
    it("marks all success snippets as non-facts", async () => {
      const invoked = await invokeMarketResearchAdapter({
        merchantContext: trustedContext(),
        rawRequest: validRequest(),
        sourceId: MARKET_SOURCE_IDS.OPENAI_WEB_SEARCH,
        operation: "retrieve",
        fixtureId: "openai_success_citations_v1",
        allowSyntheticFixtures: true,
        satisfiedConditions: [...OPENAI_RETRIEVE_CONDITIONS],
        preferredMode: "offline_stub",
      });
      expect(invoked.result.ok).toBe(true);
      if (!invoked.result.ok) return;
      expect(invoked.result.syntheticLabel).toContain("SYNTHETIC");
      for (const snippet of invoked.result.snippets) {
        expect(snippet.isRealMerchantOrMarketFact).toBe(false);
        expect(snippet.text.startsWith("SYNTHETIC")).toBe(true);
      }
    });

    it("adapter sources contain no SDK / network / persistence imports", () => {
      const root = path.join(process.cwd(), "lib/market-research/adapters");
      const files = fs
        .readdirSync(root)
        .filter((name) => name.endsWith(".ts"))
        .map((name) => path.join(root, name));

      const forbidden = [
        /\bfetch\s*\(/,
        /\bfrom\s+["']axios["']/,
        /\bfrom\s+["']openai["']/,
        /\bfrom\s+["']@google\/generative-ai["']/,
        /\bfrom\s+["']@supabase\//,
        /\bcreateClient\s*\(/,
        /\bfs\.writeFile/,
        /\bnet\.(connect|createConnection)\b/,
        /\bprocess\.env\.[A-Z0-9_]*API_KEY/,
      ];

      for (const file of files) {
        const source = fs.readFileSync(file, "utf8");
        for (const pattern of forbidden) {
          expect(
            source,
            `${path.basename(file)} matched ${pattern}`,
          ).not.toMatch(pattern);
        }
      }
    });
  });
});
