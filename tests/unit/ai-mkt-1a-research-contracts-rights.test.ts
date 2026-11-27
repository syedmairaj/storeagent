import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { buildTrustedMerchantContext } from "@/lib/commerce-agent";
import { L1_TOOL_IDS, isExplicitlyForbiddenToolId } from "@/lib/commerce-agent/tools";
import {
  MARKET_ADAPTER_IDS,
  MARKET_RESEARCH_POLICY_PIN,
  MARKET_RESEARCH_REQUEST_VERSION,
  MARKET_RESEARCH_RESULT_VERSION,
  MARKET_SOURCE_IDS,
  MARKET_SOURCE_POLICY_VERSION,
  admitMarketResearchRequest,
  assertL1MarketToolsRemainForbidden,
  assertLiveMarketResearchForbidden,
  deriveServerLicenseOk,
  evaluateGeoCategoryPolicy,
  evaluateResolvedPolicyRights,
  evaluateSourceOperationRights,
  getDefaultGeoCategoryPolicyConfig,
  getDefaultMarketResearchConfig,
  getMarketSourcePolicy,
  isProductionGeoAllowlistDisabled,
  isRegisteredMarketSource,
  listMarketResearchOperations,
  listMarketSourcePolicies,
  mapResearchEvidenceToEvidenceRecord,
  mayRunMarketResearch,
  mayUseGeminiAsAutomaticFallback,
  openaiConditionalRightsImplyLiveApproval,
  parseMarketSourcePolicy,
  parseResearchEvidenceItem,
  parseResearchProvenance,
  parseResearchRequest,
  parseResearchResult,
  registrationImpliesAuthorization,
  resolveEvidenceTimeClasses,
  resolveTrustedResearchScope,
} from "@/lib/market-research";

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG = "99999999-9999-4999-8999-999999999999";
const STORE = "22222222-2222-4222-8222-222222222222";

function trustedContext(overrides?: { organizationId?: string; storeId?: string }) {
  return buildTrustedMerchantContext({
    userId: "user-1",
    organizationId: overrides?.organizationId ?? ORG,
    role: "owner",
    permissions: ["inventory.read", "stores.read"],
    storeId: overrides?.storeId ?? STORE,
    countryCode: "AE",
    currencyCode: "AED",
    asOf: "2026-11-27T12:00:00.000Z",
  });
}

function validRequest(overrides?: Record<string, unknown>) {
  return {
    schemaVersion: MARKET_RESEARCH_REQUEST_VERSION,
    clientRequestId: "req-mkt-1",
    organizationId: ORG,
    storeId: STORE,
    countryCode: "AE",
    currencyCode: "AED",
    depth: "quick_lookup",
    intentClass: "market_opportunity",
    question: "What do public sources say about this SKU class in AE?",
    sourcePolicyVersion: MARKET_RESEARCH_POLICY_PIN,
    allowAdapters: [MARKET_ADAPTER_IDS.MERCHANT_INTERNAL],
    ...overrides,
  };
}

describe("AI-MKT-1a research contracts & rights", () => {
  describe("versioned DTOs", () => {
    it("parses a valid ResearchRequest", () => {
      const parsed = parseResearchRequest(validRequest());
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;
      expect(parsed.value.schemaVersion).toBe(MARKET_RESEARCH_REQUEST_VERSION);
      expect(parsed.value.countryCode).toBe("AE");
      expect(parsed.value.sourcePolicyVersion).toBe(MARKET_RESEARCH_POLICY_PIN);
    });

    it("rejects malformed ResearchRequest inputs", () => {
      expect(parseResearchRequest(null).ok).toBe(false);
      expect(parseResearchRequest("x").ok).toBe(false);
      expect(
        parseResearchRequest(validRequest({ schemaVersion: "wrong" })).ok,
      ).toBe(false);
      expect(
        parseResearchRequest(validRequest({ depth: "infinite" })).ok,
      ).toBe(false);
      expect(
        parseResearchRequest(validRequest({ allowAdapters: "all" })).ok,
      ).toBe(false);
      expect(
        parseResearchRequest(validRequest({ clientRequestId: "  " })).ok,
      ).toBe(false);
    });

    it("rejects policy-version mismatch on request", () => {
      const parsed = parseResearchRequest(
        validRequest({ sourcePolicyVersion: "2020-01-01.stale" }),
      );
      expect(parsed.ok).toBe(false);
      if (parsed.ok) return;
      expect(parsed.code).toBe("POLICY_VERSION_MISMATCH");
    });

    it("parses valid success and failure ResearchResult envelopes", () => {
      const failure = parseResearchResult({
        ok: false,
        schemaVersion: MARKET_RESEARCH_RESULT_VERSION,
        code: "UNSUPPORTED_GEO",
        detail: "SA not allowlisted",
      });
      expect(failure.ok).toBe(true);
      if (!failure.ok) return;
      expect(failure.value.ok).toBe(false);

      const success = parseResearchResult({
        ok: true,
        schemaVersion: MARKET_RESEARCH_RESULT_VERSION,
        requestId: "req-1",
        organizationId: ORG,
        evidence: [],
        conflicts: [],
        abstentions: [],
        creditSettlement: "not_applicable",
      });
      expect(success.ok).toBe(true);
    });

    it("parses registry policies and rejects training-consent implication", () => {
      const openai = getMarketSourcePolicy(MARKET_SOURCE_IDS.OPENAI_WEB_SEARCH);
      expect(openai).not.toBeNull();
      const parsed = parseMarketSourcePolicy(openai!);
      expect(parsed.ok).toBe(true);

      const bad = parseMarketSourcePolicy({
        ...openai!,
        modelTrainingConsentImplied: true,
      });
      expect(bad.ok).toBe(false);
      if (bad.ok) return;
      expect(bad.code).toBe("LICENSE_DENIED");
    });
  });

  describe("source registry", () => {
    it("exposes immutable versioned policies for required sources", () => {
      const policies = listMarketSourcePolicies();
      const ids = policies.map((p) => p.sourceId);
      expect(ids).toContain(MARKET_SOURCE_IDS.OPENAI_WEB_SEARCH);
      expect(ids).toContain(MARKET_SOURCE_IDS.GEMINI_SEARCH_GROUNDING);
      expect(ids).toContain(MARKET_SOURCE_IDS.MERCHANT_INTERNAL);
      expect(ids).toContain(MARKET_SOURCE_IDS.SHOPIFY_CATALOG_PROHIBITED);
      expect(ids).toContain(MARKET_SOURCE_IDS.UNKNOWN_UNREGISTERED);

      for (const policy of policies) {
        expect(policy.schemaVersion).toBe(MARKET_SOURCE_POLICY_VERSION);
        expect(policy.policyVersion).toBe(MARKET_RESEARCH_POLICY_PIN);
        expect(policy.modelTrainingConsentImplied).toBe(false);
      }
    });

    it("separates registration from authorization", () => {
      expect(registrationImpliesAuthorization()).toBe(false);
      expect(isRegisteredMarketSource(MARKET_SOURCE_IDS.OPENAI_WEB_SEARCH)).toBe(
        true,
      );
      // Registered OpenAI still denied without satisfied conditions.
      const rights = evaluateSourceOperationRights({
        sourceId: MARKET_SOURCE_IDS.OPENAI_WEB_SEARCH,
        operation: "retrieve",
      });
      expect(rights.ok).toBe(false);
    });
  });

  describe("rights enforcement", () => {
    it("denies unknown, revoked, expired, and policy-version mismatch", () => {
      const unknown = evaluateSourceOperationRights({
        sourceId: "totally_unregistered_source",
        operation: "retrieve",
      });
      expect(unknown.ok).toBe(false);
      if (!unknown.ok) expect(unknown.code).toBe("SOURCE_UNKNOWN");

      const prohibited = evaluateSourceOperationRights({
        sourceId: MARKET_SOURCE_IDS.SHOPIFY_CATALOG_PROHIBITED,
        operation: "retrieve",
      });
      expect(prohibited.ok).toBe(false);
      if (!prohibited.ok) expect(prohibited.code).toBe("LICENSE_DENIED");

      const unknownClass = evaluateSourceOperationRights({
        sourceId: MARKET_SOURCE_IDS.UNKNOWN_UNREGISTERED,
        operation: "display",
      });
      expect(unknownClass.ok).toBe(false);
      if (!unknownClass.ok) expect(unknownClass.code).toBe("LICENSE_DENIED");

      const base = getMarketSourcePolicy(MARKET_SOURCE_IDS.MERCHANT_INTERNAL)!;
      const revoked = evaluateResolvedPolicyRights({
        policy: { ...base, revoked: true },
        operation: "retrieve",
      });
      expect(revoked.ok).toBe(false);
      if (!revoked.ok) expect(revoked.code).toBe("SOURCE_REVOKED");

      const expired = evaluateResolvedPolicyRights({
        policy: { ...base, expiresAt: "2026-01-01T00:00:00.000Z" },
        operation: "retrieve",
        asOf: "2026-11-27T00:00:00.000Z",
      });
      expect(expired.ok).toBe(false);
      if (!expired.ok) expect(expired.code).toBe("LICENSE_DENIED");

      const pinMismatch = evaluateResolvedPolicyRights({
        policy: { ...base, policyVersion: "2020-01-01.stale" },
        operation: "retrieve",
      });
      expect(pinMismatch.ok).toBe(false);
      if (!pinMismatch.ok) {
        expect(pinMismatch.code).toBe("POLICY_VERSION_MISMATCH");
      }
    });

    it("evaluates operation-specific permissions and retention/attribution", () => {
      const ops = listMarketResearchOperations();
      expect(ops).toEqual([
        "retrieve",
        "display",
        "normalize",
        "analyze",
        "model_process",
        "cache",
        "retain",
        "redistribute",
      ]);

      const merchantRetrieve = evaluateSourceOperationRights({
        sourceId: MARKET_SOURCE_IDS.MERCHANT_INTERNAL,
        operation: "retrieve",
      });
      expect(merchantRetrieve.ok).toBe(true);

      const merchantRedistribute = evaluateSourceOperationRights({
        sourceId: MARKET_SOURCE_IDS.MERCHANT_INTERNAL,
        operation: "redistribute",
      });
      expect(merchantRedistribute.ok).toBe(false);

      const openaiDisplay = evaluateSourceOperationRights({
        sourceId: MARKET_SOURCE_IDS.OPENAI_WEB_SEARCH,
        operation: "display",
        satisfiedConditions: [
          "inline_citations_rendered",
          "third_party_source_rights_reviewed",
        ],
      });
      expect(openaiDisplay.ok).toBe(true);
      if (openaiDisplay.ok) {
        expect(openaiDisplay.attributionRequired).toBe(true);
        expect(openaiDisplay.durableCacheEligible).toBe(false);
      }

      const openaiDisplayNoAttr = evaluateSourceOperationRights({
        sourceId: MARKET_SOURCE_IDS.OPENAI_WEB_SEARCH,
        operation: "display",
        satisfiedConditions: ["third_party_source_rights_reviewed"],
      });
      expect(openaiDisplayNoAttr.ok).toBe(false);
      if (!openaiDisplayNoAttr.ok) {
        expect(
          openaiDisplayNoAttr.code === "RIGHTS_CONDITIONS_UNSATISFIED" ||
            openaiDisplayNoAttr.code === "ATTRIBUTION_REQUIRED",
        ).toBe(true);
      }
    });

    it("denies Gemini durable cache, warehouse normalize, analyze, and model_process", () => {
      for (const operation of [
        "normalize",
        "analyze",
        "model_process",
        "cache",
        "redistribute",
      ] as const) {
        const result = evaluateSourceOperationRights({
          sourceId: MARKET_SOURCE_IDS.GEMINI_SEARCH_GROUNDING,
          operation,
          satisfiedConditions: [
            "live_research_authorized",
            "display_only_path",
            "search_suggestions_renderable",
            "no_automatic_fallback",
            "search_suggestions_rendered_with_results",
            "end_user_who_submitted_prompt",
          ],
        });
        expect(result.ok).toBe(false);
        if (!result.ok) {
          if (operation === "cache") {
            expect(result.code).toBe("CACHE_FORBIDDEN");
          } else {
            expect(result.code).toBe("LICENSE_DENIED");
          }
        }
      }

      expect(mayUseGeminiAsAutomaticFallback()).toBe(false);
      expect(
        mayUseGeminiAsAutomaticFallback({
          satisfiedConditions: ["gemini_automatic_fallback_separately_approved"],
        }),
      ).toBe(true);
    });

    it("keeps OpenAI conditional rights from becoming implicit live approval", () => {
      expect(openaiConditionalRightsImplyLiveApproval()).toBe(false);

      // Satisfying some conditions still does not grant retrieve without all gates.
      const partial = evaluateSourceOperationRights({
        sourceId: MARKET_SOURCE_IDS.OPENAI_WEB_SEARCH,
        operation: "retrieve",
        satisfiedConditions: ["third_party_source_rights_reviewed"],
      });
      expect(partial.ok).toBe(false);
      if (!partial.ok) {
        expect(partial.code).toBe("RIGHTS_CONDITIONS_UNSATISFIED");
        expect(partial.missingConditions?.length).toBeGreaterThan(0);
      }

      // Even with all retrieve conditions, Output ownership ≠ implicit license
      // for redistribute / live approval helpers.
      const fullRetrieve = evaluateSourceOperationRights({
        sourceId: MARKET_SOURCE_IDS.OPENAI_WEB_SEARCH,
        operation: "retrieve",
        satisfiedConditions: [
          "live_research_authorized",
          "third_party_source_rights_reviewed",
          "credit_reservation_ok",
        ],
      });
      expect(fullRetrieve.ok).toBe(true);
      expect(openaiConditionalRightsImplyLiveApproval()).toBe(false);

      const redistribute = evaluateSourceOperationRights({
        sourceId: MARKET_SOURCE_IDS.OPENAI_WEB_SEARCH,
        operation: "redistribute",
        satisfiedConditions: [
          "live_research_authorized",
          "third_party_source_rights_reviewed",
          "credit_reservation_ok",
        ],
      });
      expect(redistribute.ok).toBe(false);

      // Durable cache still forbidden without ephemeral exception.
      const cache = evaluateSourceOperationRights({
        sourceId: MARKET_SOURCE_IDS.OPENAI_WEB_SEARCH,
        operation: "cache",
        satisfiedConditions: [
          "tenant_scoped_only",
          "third_party_source_rights_reviewed",
          "retention_within_max_days",
        ],
      });
      expect(cache.ok).toBe(false);
      if (!cache.ok) expect(cache.code).toBe("CACHE_FORBIDDEN");
    });

    it("never trusts caller-supplied licenseOk / policy / permissions / approval", () => {
      const forged = evaluateSourceOperationRights({
        sourceId: MARKET_SOURCE_IDS.MERCHANT_INTERNAL,
        operation: "retrieve",
        untrusted: { licenseOk: true },
      });
      expect(forged.ok).toBe(false);
      if (!forged.ok) expect(forged.code).toBe("FORGED_POLICY_INPUT");

      expect(
        evaluateSourceOperationRights({
          sourceId: MARKET_SOURCE_IDS.MERCHANT_INTERNAL,
          operation: "retrieve",
          untrusted: { policy: { rightsClass: "merchant_owned" } },
        }).ok,
      ).toBe(false);

      expect(
        evaluateSourceOperationRights({
          sourceId: MARKET_SOURCE_IDS.OPENAI_WEB_SEARCH,
          operation: "retrieve",
          untrusted: { approval: true, permissions: { retrieve: "allow" } },
        }).ok,
      ).toBe(false);

      expect(
        deriveServerLicenseOk({
          sourceId: MARKET_SOURCE_IDS.OPENAI_WEB_SEARCH,
          operation: "retrieve",
        }),
      ).toBe(false);

      const provenance = parseResearchProvenance({
        sourceId: MARKET_SOURCE_IDS.OPENAI_WEB_SEARCH,
        adapterId: MARKET_ADAPTER_IDS.OPENAI_WEB_SEARCH,
        sourceUrls: ["https://example.com"],
        retrievedAt: "2026-11-27T12:00:00.000Z",
        licenseOk: true,
        rightsClass: "provider_output_owned",
        sourcePolicyVersion: MARKET_RESEARCH_POLICY_PIN,
      });
      expect(provenance.ok).toBe(false);
      if (!provenance.ok) expect(provenance.code).toBe("FORGED_POLICY_INPUT");
    });
  });

  describe("geo / category policy", () => {
    it("allows AE design allowlist and rejects unsupported countries", () => {
      const ae = evaluateGeoCategoryPolicy({ countryCode: "AE" });
      expect(ae.ok).toBe(true);
      if (ae.ok) expect(ae.usageClass).toBe("design_allowlist");

      const sa = evaluateGeoCategoryPolicy({ countryCode: "SA" });
      expect(sa.ok).toBe(false);
      if (!sa.ok) expect(sa.code).toBe("UNSUPPORTED_GEO");

      expect(evaluateGeoCategoryPolicy({ countryCode: "*" }).ok).toBe(false);
      expect(evaluateGeoCategoryPolicy({ countryCode: "GLOBAL" }).ok).toBe(
        false,
      );
      expect(isProductionGeoAllowlistDisabled()).toBe(true);
    });

    it("permits US/GB only in synthetic fixture mode", () => {
      const usBlocked = evaluateGeoCategoryPolicy({ countryCode: "US" });
      expect(usBlocked.ok).toBe(false);

      const usFixture = evaluateGeoCategoryPolicy({
        countryCode: "US",
        syntheticFixtureMode: true,
      });
      expect(usFixture.ok).toBe(true);
      if (usFixture.ok) {
        expect(usFixture.usageClass).toBe("synthetic_fixture_only");
      }

      const gbFixture = evaluateGeoCategoryPolicy({
        countryCode: "GB",
        syntheticFixtureMode: true,
      });
      expect(gbFixture.ok).toBe(true);
    });

    it("enforces owner-gated exact category selection (no wildcards)", () => {
      expect(
        evaluateGeoCategoryPolicy({
          countryCode: "AE",
          categoryHint: "home_kitchen",
        }).ok,
      ).toBe(false);

      expect(
        evaluateGeoCategoryPolicy({
          countryCode: "AE",
          categoryHint: "*",
        }).ok,
      ).toBe(false);

      const authorized = evaluateGeoCategoryPolicy({
        countryCode: "AE",
        categoryHint: "home_kitchen",
        config: {
          ...getDefaultGeoCategoryPolicyConfig(),
          categorySelectionOwnerAuthorized: true,
          allowedCategories: ["home_kitchen"],
        },
      });
      expect(authorized.ok).toBe(true);
    });
  });

  describe("trusted scope & time classes", () => {
    it("resolves organization/grain from MerchantContext and rejects tenant mismatch", () => {
      const ok = resolveTrustedResearchScope({
        merchantContext: trustedContext(),
        untrustedHints: { organizationId: ORG, storeId: STORE },
      });
      expect(ok.ok).toBe(true);
      if (ok.ok) expect(ok.scope.organizationId).toBe(ORG);

      const mismatch = resolveTrustedResearchScope({
        merchantContext: trustedContext(),
        untrustedHints: { organizationId: OTHER_ORG },
      });
      expect(mismatch.ok).toBe(false);
      if (!mismatch.ok) expect(mismatch.code).toBe("TENANT_SCOPE_MISMATCH");
    });

    it("rejects forged policy / adapter / license overrides on scope", () => {
      const forged = resolveTrustedResearchScope({
        merchantContext: trustedContext(),
        untrustedHints: {
          organizationId: ORG,
          licenseOk: true,
        },
      });
      expect(forged.ok).toBe(false);
      if (!forged.ok) expect(forged.code).toBe("FORGED_POLICY_INPUT");

      expect(
        resolveTrustedResearchScope({
          merchantContext: trustedContext(),
          untrustedHints: { adapterOverride: "openai_web_search_v1" },
        }).ok,
      ).toBe(false);
    });

    it("does not treat unknown observation time as current", () => {
      const unknown = resolveEvidenceTimeClasses({
        retrievedAt: "2026-11-27T12:00:00.000Z",
      });
      expect(unknown.observationKnown).toBe(false);
      expect(unknown.freshnessClass).toBe("unknown");

      const current = resolveEvidenceTimeClasses({
        retrievedAt: "2026-11-27T12:00:00.000Z",
        observationPeriodEnd: "2026-11-26T00:00:00.000Z",
      });
      expect(current.observationKnown).toBe(true);
      expect(current.freshnessClass).toBe("current");

      const stale = resolveEvidenceTimeClasses({
        retrievedAt: "2026-11-27T12:00:00.000Z",
        observationPeriodEnd: "2026-10-01T00:00:00.000Z",
      });
      expect(stale.freshnessClass).toBe("stale");
    });

    it("maps research evidence into EvidenceRecord without inventing licenseOk", () => {
      const itemParsed = parseResearchEvidenceItem({
        evidenceId: "ev-1",
        claimClass: "sourced_signal",
        signalClass: "public_listing",
        label: "Listing title match",
        value: "Sample blender 500W",
        countryCode: "AE",
        matchQuality: "partial",
        freshnessClass: "current",
        confidenceClass: "low",
        permittedFields: ["label", "value", "countryCode"],
        provenance: {
          sourceId: MARKET_SOURCE_IDS.OPENAI_WEB_SEARCH,
          adapterId: MARKET_ADAPTER_IDS.OPENAI_WEB_SEARCH,
          sourceUrls: ["https://example.com/listing"],
          retrievedAt: "2026-11-27T12:00:00.000Z",
          licenseOk: false,
          rightsClass: "provider_output_owned",
          sourcePolicyVersion: MARKET_RESEARCH_POLICY_PIN,
        },
      });
      expect(itemParsed.ok).toBe(true);
      if (!itemParsed.ok) return;

      const record = mapResearchEvidenceToEvidenceRecord({
        item: itemParsed.value,
        organizationId: ORG,
        storeId: STORE,
      });
      expect(record.organizationId).toBe(ORG);
      expect(record.sourceSystem).toBe(MARKET_SOURCE_IDS.OPENAI_WEB_SEARCH);
      expect(record.licenseOk).toBe(false);
      expect(record.claimClass).toBe("sourced_signal");
      expect(record.freshnessClass).toBe("unknown");
      expect(record.label).toContain("public_listing");
    });
  });

  describe("enablement boundary", () => {
    it("defaults OFF and never allows live execution", () => {
      const defaults = getDefaultMarketResearchConfig();
      expect(defaults.enabled).toBe(false);
      expect(defaults.supportsLiveNetwork).toBe(false);

      const resolved = mayRunMarketResearch({ organizationId: ORG });
      expect(resolved.researchEnabled).toBe(false);
      expect(resolved.mayRunLive).toBe(false);
      expect(resolved.mayRunSyntheticFixtures).toBe(false);
      expect(resolved.liveBlockedReason).toBe(
        "LIVE_EXECUTION_FORBIDDEN_IN_AI_MKT_1A",
      );

      const live = assertLiveMarketResearchForbidden();
      expect(live.allowed).toBe(false);
      expect(live.code).toBe("LIVE_EXECUTION_FORBIDDEN");

      const forcedLive = mayRunMarketResearch({
        organizationId: ORG,
        allowSyntheticFixtures: true,
        requestLiveNetwork: true,
      });
      expect(forcedLive.mayRunLive).toBe(false);
      expect(forcedLive.mayRunSyntheticFixtures).toBe(false);
    });

    it("allows synthetic fixtures only via explicit injection", () => {
      const fixtures = mayRunMarketResearch({
        organizationId: ORG,
        allowSyntheticFixtures: true,
      });
      expect(fixtures.mayRunSyntheticFixtures).toBe(true);
      expect(fixtures.mayRunLive).toBe(false);
      expect(fixtures.enablementSource).toBe("test_injected_fixture");
      expect(fixtures.supportsLiveNetwork).toBe(false);
    });

    it("keeps L1 web_search / market.* forbidden and unexpanded", () => {
      const guard = assertL1MarketToolsRemainForbidden();
      expect(guard.ok).toBe(true);
      expect(guard.webSearchForbidden).toBe(true);
      expect(guard.marketPrefixForbidden).toBe(true);

      expect(isExplicitlyForbiddenToolId("web_search")).toBe(true);
      expect(isExplicitlyForbiddenToolId("market.research")).toBe(true);
      for (const toolId of L1_TOOL_IDS) {
        expect(toolId.startsWith("market.")).toBe(false);
        expect(toolId.includes("web_search")).toBe(false);
      }
    });

    it("admission gate rejects default-OFF and live paths; admits fixture-only merchant path", () => {
      const disabled = admitMarketResearchRequest({
        merchantContext: trustedContext(),
        rawRequest: validRequest(),
        sourceId: MARKET_SOURCE_IDS.MERCHANT_INTERNAL,
        operation: "retrieve",
      });
      expect(disabled.ok).toBe(false);
      if (!disabled.ok) expect(disabled.code).toBe("RESEARCH_DISABLED");

      const liveDenied = admitMarketResearchRequest({
        merchantContext: trustedContext(),
        rawRequest: validRequest(),
        sourceId: MARKET_SOURCE_IDS.MERCHANT_INTERNAL,
        operation: "retrieve",
        allowSyntheticFixtures: true,
        requestLiveNetwork: true,
      });
      expect(liveDenied.ok).toBe(false);
      if (!liveDenied.ok) {
        expect(liveDenied.code).toBe("LIVE_EXECUTION_FORBIDDEN");
      }

      const admitted = admitMarketResearchRequest({
        merchantContext: trustedContext(),
        rawRequest: validRequest(),
        sourceId: MARKET_SOURCE_IDS.MERCHANT_INTERNAL,
        operation: "retrieve",
        allowSyntheticFixtures: true,
        syntheticFixtureMode: true,
      });
      expect(admitted.ok).toBe(true);
      if (admitted.ok) {
        expect(admitted.mode).toBe("synthetic_fixture");
        expect(admitted.enablement.mayRunLive).toBe(false);
      }

      const foreign = admitMarketResearchRequest({
        merchantContext: trustedContext(),
        rawRequest: validRequest({ organizationId: OTHER_ORG }),
        sourceId: MARKET_SOURCE_IDS.MERCHANT_INTERNAL,
        operation: "retrieve",
        allowSyntheticFixtures: true,
      });
      expect(foreign.ok).toBe(false);
      if (!foreign.ok) expect(foreign.code).toBe("TENANT_SCOPE_MISMATCH");

      const forgedReq = admitMarketResearchRequest({
        merchantContext: trustedContext(),
        rawRequest: validRequest({ licenseOk: true }),
        sourceId: MARKET_SOURCE_IDS.MERCHANT_INTERNAL,
        operation: "retrieve",
        allowSyntheticFixtures: true,
      });
      expect(forgedReq.ok).toBe(false);
      if (!forgedReq.ok) expect(forgedReq.code).toBe("FORGED_POLICY_INPUT");
    });
  });

  describe("offline / no persistence invariants", () => {
    it("market-research sources contain no network or persistence APIs", () => {
      const root = path.join(process.cwd(), "lib/market-research");
      const files = fs
        .readdirSync(root)
        .filter((name) => name.endsWith(".ts"))
        .map((name) => path.join(root, name));

      const forbidden = [
        /\bfetch\s*\(/,
        /\bfrom\s+["']axios["']/,
        /\bhttp\.request\b/,
        /\bhttps\.request\b/,
        /\bcreateClient\s*\(/,
        /\bfrom\s+["']@supabase\//,
        /\bfrom\s+["']openai["']/,
        /\bfrom\s+["']@google\/generative-ai["']/,
        /\bfs\.writeFile/,
        /\bnet\.(connect|createConnection|createServer)\b/,
        /\blocalStorage\b/,
        /\bindexedDB\b/,
      ];

      for (const file of files) {
        const source = fs.readFileSync(file, "utf8");
        for (const pattern of forbidden) {
          expect(source, `${path.basename(file)} matched ${pattern}`).not.toMatch(
            pattern,
          );
        }
      }
    });
  });
});
