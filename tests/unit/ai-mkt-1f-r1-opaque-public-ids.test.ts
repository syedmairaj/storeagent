/**
 * AI-MKT-1f-R1 — opaque merchant public ID hardening.
 * Exercises real toMerchantResearchDto / public-id mapper / correlation helpers.
 */

import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { buildTrustedMerchantContext } from "@/lib/commerce-agent";
import {
  MARKET_ADAPTER_IDS,
  MARKET_RESEARCH_POLICY_PIN,
  MARKET_RESEARCH_REQUEST_VERSION,
  MARKET_SOURCE_IDS,
  OPENAI_ANALYZE_CONDITIONS,
  OPENAI_NORMALIZE_CONDITIONS,
  OPENAI_RETRIEVE_CONDITIONS,
  assertMerchantResearchSafeDto,
  createMerchantPublicIdMapper,
  findInternalIdLeakage,
  isCurrentMarketResearchResponse,
  isOpaqueMerchantPublicId,
  looksLikeInternalMarketResearchId,
  merchantResearchError,
  runMarketResearchOrchestration,
  toMerchantResearchDto,
  validateMaterialResearchClaim,
  type MaterialResearchClaim,
  type NormalizedEvidenceItem,
} from "@/lib/market-research";

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG = "99999999-9999-4999-8999-999999999999";
const STORE = "22222222-2222-4222-8222-222222222222";
const LOCATION = "33333333-3333-4333-8333-333333333333";
const VARIANT = "44444444-4444-4444-8444-444444444444";
const REQ = "req-mkt-1f-r1";
const NOW = "2026-11-27T12:00:00.000Z";

const EXACT_TARGET = {
  brand: "BlendCo",
  model: "BC-500",
  gtin: "1234567890123",
  mpn: "BC500-AE",
  variant: "500W-black",
  size: "standard",
  color: "black",
  capacity: "500W",
  packQuantity: 1 as const,
  condition: "new" as const,
  category: "kitchen_appliances",
  role: "product" as const,
  title: "BlendCo BC-500 500W Kitchen Blender",
};

function trustedContext(organizationId = ORG) {
  return buildTrustedMerchantContext({
    userId: "user-1f-r1",
    organizationId,
    role: "owner",
    permissions: ["inventory.read", "stores.read"],
    storeId: STORE,
    locationId: LOCATION,
    variantId: VARIANT,
    countryCode: "AE",
    currencyCode: "AED",
    asOf: NOW,
  });
}

function validRequest(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: MARKET_RESEARCH_REQUEST_VERSION,
    clientRequestId: REQ,
    organizationId: ORG,
    storeId: STORE,
    variantId: VARIANT,
    sku: "SKU-BC500",
    countryCode: "AE",
    currencyCode: "AED",
    depth: "quick_lookup",
    intentClass: "market_opportunity",
    question: "SYNTHETIC market research R1 evaluation question (not live)",
    sourcePolicyVersion: MARKET_RESEARCH_POLICY_PIN,
    allowAdapters: [MARKET_ADAPTER_IDS.OPENAI_WEB_SEARCH],
    ...overrides,
  };
}

async function answeredDto(input?: {
  organizationId?: string;
  clientRequestId?: string;
  publicIdKeyMaterial?: string;
}) {
  const organizationId = input?.organizationId ?? ORG;
  const clientRequestId = input?.clientRequestId ?? REQ;
  const orch = await runMarketResearchOrchestration({
    merchantContext: trustedContext(organizationId),
    rawRequest: validRequest({
      organizationId,
      clientRequestId,
    }),
    targetProduct: EXACT_TARGET,
    sourceId: MARKET_SOURCE_IDS.OPENAI_WEB_SEARCH,
    nowIso: NOW,
    allowSyntheticFixtures: true,
    syntheticFixtureMode: true,
    fixtureId: "openai_success_citations_v1",
    registryKey: "openai_offline_stub",
    satisfiedRetrieveConditions: [...OPENAI_RETRIEVE_CONDITIONS],
    satisfiedNormalizeConditions: [...OPENAI_NORMALIZE_CONDITIONS],
    satisfiedAnalyzeConditions: [...OPENAI_ANALYZE_CONDITIONS],
  });
  expect(orch.status === "answered" || orch.status === "partial").toBe(true);
  const dto = toMerchantResearchDto({
    result: orch,
    clientRequestId,
    intentClass: "market_opportunity",
    countryCode: "AE",
    depth: "quick_lookup",
    publicIdKeyMaterial: input?.publicIdKeyMaterial,
  });
  assertMerchantResearchSafeDto(dto);
  return { orch, dto };
}

function baseClaim(
  evidence: NormalizedEvidenceItem,
  overrides: Partial<MaterialResearchClaim> = {},
): MaterialResearchClaim {
  return {
    claimId: `claim:${evidence.evidenceId}`,
    evidenceId: evidence.evidenceId,
    assertedValue: evidence.rawValue,
    unit: evidence.unit,
    currencyCode: evidence.currencyCode,
    countryCode: evidence.countryCode,
    claimClass: evidence.claimClass,
    signalClass: evidence.signalClass,
    productGrain:
      evidence.matchQuality === "exact"
        ? "exact_sku"
        : evidence.matchQuality === "partial"
          ? "partial"
          : "unknown",
    observationClass:
      !evidence.observationKnown || evidence.freshnessClass === "unknown"
        ? "unknown"
        : evidence.freshnessClass === "stale"
          ? "historical"
          : "current",
    ...overrides,
  };
}

describe("AI-MKT-1f-R1 opaque merchant public IDs", () => {
  it("maps internal evidence/finding/conflict IDs to opaque public IDs", async () => {
    const { orch, dto } = await answeredDto({ publicIdKeyMaterial: "r1-key-a" });
    expect(dto.kind === "answered" || dto.kind === "partial").toBe(true);
    if (dto.kind !== "answered" && dto.kind !== "partial") {
      return;
    }
    if (orch.status !== "answered" && orch.status !== "partial") {
      return;
    }

    const internalEvidence = orch.findings.map((f) => f.evidenceId);
    expect(internalEvidence.some((id) => id.includes(ORG))).toBe(true);
    expect(internalEvidence.some((id) => id.startsWith("mkt1c:"))).toBe(true);

    for (const finding of dto.findings) {
      expect(isOpaqueMerchantPublicId(finding.evidenceId)).toBe(true);
      expect(isOpaqueMerchantPublicId(finding.findingId)).toBe(true);
      expect(finding.evidenceId.startsWith("mev_")).toBe(true);
      expect(finding.findingId.startsWith("mfd_")).toBe(true);
      expect(finding.evidenceId.includes(ORG)).toBe(false);
      expect(finding.findingId.includes(ORG)).toBe(false);
      expect(finding.evidenceId.includes(REQ)).toBe(false);
    }
    for (const conflict of dto.conflicts) {
      expect(isOpaqueMerchantPublicId(conflict.conflictId)).toBe(true);
      expect(conflict.conflictId.startsWith("mcf_")).toBe(true);
    }
  });

  it("preserves citation ↔ finding referential integrity with public IDs", async () => {
    const { dto } = await answeredDto({ publicIdKeyMaterial: "r1-key-b" });
    if (dto.kind !== "answered" && dto.kind !== "partial") {
      expect.fail("expected answered/partial");
      return;
    }
    const allowed = new Set(dto.findings.map((f) => f.evidenceId));
    expect(dto.citations.length).toBeGreaterThan(0);
    for (const citation of dto.citations) {
      expect(allowed.has(citation.evidenceId)).toBe(true);
      expect(isOpaqueMerchantPublicId(citation.evidenceId)).toBe(true);
    }
  });

  it("issues unique public IDs within a response", async () => {
    const { dto } = await answeredDto({ publicIdKeyMaterial: "r1-key-c" });
    if (dto.kind !== "answered" && dto.kind !== "partial") {
      expect.fail("expected answered/partial");
      return;
    }
    const findingIds = dto.findings.map((f) => f.findingId);
    const evidenceIds = dto.findings.map((f) => f.evidenceId);
    expect(new Set(findingIds).size).toBe(findingIds.length);
    expect(new Set(evidenceIds).size).toBe(evidenceIds.length);
  });

  it("isolates public IDs across tenants/responses (no cross-correlation)", async () => {
    const a = await answeredDto({
      organizationId: ORG,
      publicIdKeyMaterial: "tenant-a-scope",
    });
    const b = await answeredDto({
      organizationId: OTHER_ORG,
      clientRequestId: "req-other-tenant",
      publicIdKeyMaterial: "tenant-b-scope",
    });
    if (
      (a.dto.kind !== "answered" && a.dto.kind !== "partial") ||
      (b.dto.kind !== "answered" && b.dto.kind !== "partial")
    ) {
      expect.fail("expected answered/partial for both tenants");
      return;
    }
    const aIds = new Set(a.dto.findings.map((f) => f.evidenceId));
    for (const id of b.dto.findings.map((f) => f.evidenceId)) {
      expect(aIds.has(id)).toBe(false);
    }
    expect(JSON.stringify(a.dto).includes(ORG)).toBe(false);
    expect(JSON.stringify(b.dto).includes(OTHER_ORG)).toBe(false);
    expect(JSON.stringify(b.dto).includes(ORG)).toBe(false);
  });

  it("rejects internal ID shapes and adversarial leakage in safe DTO assert", async () => {
    const { dto } = await answeredDto({ publicIdKeyMaterial: "r1-key-d" });
    expect(() => assertMerchantResearchSafeDto(dto)).not.toThrow();

    expect(
      looksLikeInternalMarketResearchId(`mkt1c:${ORG}:${REQ}:oa-s1`),
    ).toBe(true);
    expect(
      looksLikeInternalMarketResearchId(
        `mkt1d-finding:mkt1c:${ORG}:${REQ}:oa-s1`,
      ),
    ).toBe(true);
    expect(
      looksLikeInternalMarketResearchId("mev_abcdef0123456789abcdef01"),
    ).toBe(false);

    expect(() =>
      assertMerchantResearchSafeDto({
        ok: true,
        evidenceId: `mkt1c:${ORG}:${REQ}:oa-s1`,
      }),
    ).toThrow(/UNSAFE_MERCHANT_RESEARCH_DTO_INTERNAL_ID/);

    const leaks = findInternalIdLeakage(
      {
        poison: `mkt1c:${ORG}:${REQ}:oa-s1`,
        findingId: `mkt1d-finding:mkt1c:${ORG}:x`,
      },
      [ORG, STORE],
    );
    expect(leaks.length).toBeGreaterThan(0);

    const err = merchantResearchError({
      code: "INVALID_INPUT",
      error: `bad ref mkt1c:${ORG}:${REQ}:oa-s1`,
      clientRequestId: REQ,
    });
    expect(err.error).not.toContain("mkt1c:");
    expect(err.error).not.toContain(ORG);
  });

  it("keeps internal evidence IDs authoritative for claim validation", async () => {
    const { orch } = await answeredDto({ publicIdKeyMaterial: "r1-key-e" });
    if (orch.status !== "answered" && orch.status !== "partial") {
      expect.fail("expected orchestration success");
      return;
    }
    const evidence = orch.acceptedEvidence[0];
    expect(evidence.evidenceId.startsWith("mkt1c:")).toBe(true);

    const accepted = new Map([[evidence.evidenceId, evidence]]);
    const forged = validateMaterialResearchClaim({
      claim: baseClaim(evidence, { evidenceId: "mkt1c:forged:not-real" }),
      acceptedById: accepted,
      evidenceHash: orch.evidenceHash,
      rejectedEvidenceIds: new Set(),
    });
    expect(forged.ok).toBe(false);
    if (!forged.ok) {
      expect(forged.code).toBe("EVIDENCE_NOT_ACCEPTED");
    }

    const bound = validateMaterialResearchClaim({
      claim: baseClaim(evidence),
      acceptedById: accepted,
      evidenceHash: orch.evidenceHash,
      rejectedEvidenceIds: new Set(),
    });
    // Bound internal ID must be recognized (not forged). Honesty denials are OK;
    // EVIDENCE_NOT_ACCEPTED would mean the internal ID was rejected as unknown.
    if (!bound.ok) {
      expect(bound.code).not.toBe("EVIDENCE_NOT_ACCEPTED");
    } else {
      expect(bound.evidenceId).toBe(evidence.evidenceId);
    }
    expect(evidence.evidenceId.startsWith("mev_")).toBe(false);
  });

  it("verifies malformed / missing / mismatched response correlation fields", () => {
    const latest = {
      clientRequestId: "mr:aaa:111",
      grainKey: `${STORE}:${LOCATION}:${VARIANT}`,
      intentClass: "market_opportunity" as const,
      countryCode: "AE",
      depth: "quick_lookup",
    };

    expect(
      isCurrentMarketResearchResponse({
        latest,
        responseClientRequestId: latest.clientRequestId,
        responseIntentClass: latest.intentClass,
        responseCountryCode: latest.countryCode,
        responseDepth: latest.depth,
        grainKey: latest.grainKey,
      }),
    ).toBe(true);

    expect(
      isCurrentMarketResearchResponse({
        latest,
        responseClientRequestId: undefined,
        responseIntentClass: latest.intentClass,
        grainKey: latest.grainKey,
      }),
    ).toBe(false);
    expect(
      isCurrentMarketResearchResponse({
        latest,
        responseClientRequestId: latest.clientRequestId,
        responseIntentClass: undefined,
        grainKey: latest.grainKey,
      }),
    ).toBe(false);
    expect(
      isCurrentMarketResearchResponse({
        latest: null,
        responseClientRequestId: latest.clientRequestId,
        responseIntentClass: latest.intentClass,
        grainKey: latest.grainKey,
      }),
    ).toBe(false);

    expect(
      isCurrentMarketResearchResponse({
        latest,
        responseClientRequestId: "",
        responseIntentClass: latest.intentClass,
        grainKey: latest.grainKey,
      }),
    ).toBe(false);
    expect(
      isCurrentMarketResearchResponse({
        latest,
        responseClientRequestId: latest.clientRequestId,
        responseIntentClass: "",
        grainKey: latest.grainKey,
      }),
    ).toBe(false);

    expect(
      isCurrentMarketResearchResponse({
        latest,
        responseClientRequestId: "mr:other",
        responseIntentClass: latest.intentClass,
        responseCountryCode: latest.countryCode,
        responseDepth: latest.depth,
        grainKey: latest.grainKey,
      }),
    ).toBe(false);
    expect(
      isCurrentMarketResearchResponse({
        latest,
        responseClientRequestId: latest.clientRequestId,
        responseIntentClass: "competitor_research",
        responseCountryCode: latest.countryCode,
        responseDepth: latest.depth,
        grainKey: latest.grainKey,
      }),
    ).toBe(false);
    expect(
      isCurrentMarketResearchResponse({
        latest,
        responseClientRequestId: latest.clientRequestId,
        responseIntentClass: latest.intentClass,
        responseCountryCode: "US",
        responseDepth: latest.depth,
        grainKey: latest.grainKey,
      }),
    ).toBe(false);
    expect(
      isCurrentMarketResearchResponse({
        latest,
        responseClientRequestId: latest.clientRequestId,
        responseIntentClass: latest.intentClass,
        responseCountryCode: latest.countryCode,
        responseDepth: "standard",
        grainKey: latest.grainKey,
      }),
    ).toBe(false);
    expect(
      isCurrentMarketResearchResponse({
        latest,
        responseClientRequestId: latest.clientRequestId,
        responseIntentClass: latest.intentClass,
        responseCountryCode: latest.countryCode,
        responseDepth: latest.depth,
        grainKey: `${STORE}:${LOCATION}:other-variant`,
      }),
    ).toBe(false);
  });

  it("mapper is stable within scope and non-reversible from public ID", () => {
    const mapper = createMerchantPublicIdMapper("fixed-scope-key");
    const internal = `mkt1c:${ORG}:${REQ}:oa-s1`;
    const a = mapper.mapEvidenceId(internal);
    const b = mapper.mapEvidenceId(internal);
    expect(a).toBe(b);
    expect(isOpaqueMerchantPublicId(a)).toBe(true);
    expect(a.includes(ORG)).toBe(false);
    expect(Buffer.from(a, "base64").toString("utf8")).not.toContain(ORG);
    const other = createMerchantPublicIdMapper("other-scope-key").mapEvidenceId(
      internal,
    );
    expect(other).not.toBe(a);
    expect(a).not.toBe(
      `mev_${createHash("sha256").update(internal).digest("hex").slice(0, 24)}`,
    );
  });
});
