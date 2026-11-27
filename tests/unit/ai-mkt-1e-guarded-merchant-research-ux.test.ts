import fs from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import type { MerchantInventoryIntelligenceRow } from "@/lib/inventory-intelligence/types";
import {
  FORBIDDEN_MERCHANT_RESEARCH_CLIENT_KEYS,
  FORBIDDEN_SYNTHETIC_ENV_OVERRIDE_KEYS,
  assertMerchantResearchSafeDto,
  assertProductionMarketResearchExecutionForbidden,
  buildTrustedTargetProductFromRow,
  createMarketResearchClientRequestId,
  detectForbiddenSyntheticEnvOverrides,
  isCurrentMarketResearchResponse,
  mayShowMarketResearchPanel,
  merchantResearchError,
  runGuardedMerchantResearch,
  toMerchantResearchDto,
  type MerchantResearchPorts,
} from "@/lib/market-research";
import type { MarketResearchOrchestrationResult } from "@/lib/market-research/orchestration/types";
import * as permissions from "@/lib/tenancy/permissions";

const ROOT = path.resolve(__dirname, "../..");

const ORG = "11111111-1111-4111-8111-111111111111";
const STORE = "22222222-2222-4222-8222-222222222222";
const LOCATION = "33333333-3333-4333-8333-333333333333";
const VARIANT = "44444444-4444-4444-8444-444444444444";
const OTHER_ORG = "99999999-9999-4999-8999-999999999999";
const NOW = "2026-11-27T12:00:00.000Z";

function read(relative: string): string {
  return fs.readFileSync(path.join(ROOT, relative), "utf8");
}

function row(
  overrides: Partial<MerchantInventoryIntelligenceRow> = {},
): MerchantInventoryIntelligenceRow {
  return {
    snapshotId: "snap-1",
    organizationId: ORG,
    storeId: STORE,
    locationId: LOCATION,
    variantId: VARIANT,
    grainKey: `${STORE}:${LOCATION}:${VARIANT}`,
    sku: "SKU-BC500",
    productTitle: "BlendCo BC-500 500W Kitchen Blender",
    storeName: "snapstore",
    locationName: "Main",
    availableQuantity: 10,
    onHandQuantity: 10,
    observedAt: "2026-11-18T12:00:00.000Z",
    asOfMetricDate: "2026-11-20",
    metricDate: "2026-11-18",
    salesVelocity30d: 2,
    salesVelocity30dReasonCode: null,
    eligibleDays30d: 28,
    coverageRatio30d: 0.9,
    daysOfStock: 5,
    daysOfStockReasonCode: null,
    safetyStock: 10,
    safetyStockReasonCode: null,
    reorderPoint: 24,
    reorderPointReasonCode: null,
    targetStock: 38,
    targetStockReasonCode: null,
    coverStatus: "valid",
    evidenceLabel: "valid cover",
    ...overrides,
  };
}

function baseInput(
  overrides: Partial<{
    organizationId: string;
    storeId: string;
    locationId: string;
    variantId: string;
    intentClass: string;
    countryCode: string;
    depth: string;
    clientRequestId: string;
  }> = {},
) {
  return {
    organizationId: ORG,
    storeId: STORE,
    locationId: LOCATION,
    variantId: VARIANT,
    intentClass: "market_opportunity",
    countryCode: "AE",
    depth: "quick_lookup",
    clientRequestId: "req-mkt-1e-001",
    ...overrides,
  };
}

function ports(input: {
  role?: "owner" | "admin" | "analyst" | "operator";
  rows?: MerchantInventoryIntelligenceRow[];
  enabled?: boolean;
  allowlist?: string[];
  unauthenticated?: boolean;
  orgDenied?: boolean;
  preview?: boolean;
  loadSpy?: { count: number };
  signal?: AbortSignal;
}): MerchantResearchPorts {
  return {
    requireIdentity: async () => {
      if (input.unauthenticated) {
        throw new Error("UNAUTHENTICATED");
      }
      return { userId: "user-1" };
    },
    resolveOrganization: async (_identity, organizationId) => {
      if (input.orgDenied || organizationId === OTHER_ORG) {
        return { ok: false };
      }
      return {
        ok: true,
        context: {
          organizationId,
          role: input.role ?? "owner",
        },
      };
    },
    loadIntelligenceRows: async () => {
      if (input.loadSpy) {
        input.loadSpy.count += 1;
      }
      return input.rows ?? [row()];
    },
    readConfig: () => ({
      enabled: input.enabled ?? false,
      organizationAllowlist: input.allowlist ?? [],
      supportsLiveNetwork: false,
    }),
    previewIsolation: input.preview
      ? {
          allowSyntheticFixtures: true,
          syntheticFixtureMode: true,
          fixtureId: "openai_success_citations_v1",
          registryKey: "openai_offline_stub",
          nowIso: NOW,
          nowMs: Date.parse(NOW),
          signal: input.signal,
        }
      : undefined,
    enforceProductionEnvIsolation: !input.preview,
    nowIso: NOW,
    nowMs: Date.parse(NOW),
    signal: input.signal,
  };
}

describe("AI-MKT-1e guarded merchant research UX", () => {
  it("defaults hidden and rejects production path before grain load / orchestration", async () => {
    const loadSpy = { count: 0 };
    const result = await runGuardedMerchantResearch(
      baseInput(),
      ports({ loadSpy }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.code).toBe("RESEARCH_DISABLED");
    expect(loadSpy.count).toBe(0);
  });

  it("ignores enabled env soft-show without preview injection — zero orchestration", async () => {
    const loadSpy = { count: 0 };
    const result = await runGuardedMerchantResearch(
      baseInput(),
      ports({
        enabled: true,
        allowlist: [ORG],
        loadSpy,
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.code).toBe("RESEARCH_DISABLED");
    expect(loadSpy.count).toBe(0);
  });

  it("rejects unauthenticated callers with zero grain loads", async () => {
    const loadSpy = { count: 0 };
    const result = await runGuardedMerchantResearch(
      baseInput(),
      ports({ unauthenticated: true, preview: true, loadSpy }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.code).toBe("UNAUTHORIZED");
    expect(loadSpy.count).toBe(0);
  });

  it("rejects wrong-tenant membership before grain load", async () => {
    const loadSpy = { count: 0 };
    const result = await runGuardedMerchantResearch(
      baseInput({ organizationId: OTHER_ORG }),
      ports({ preview: true, loadSpy }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.code).toBe("UNAUTHORIZED");
    expect(loadSpy.count).toBe(0);
  });

  it("rejects callers without inventory.read before orchestration", async () => {
    const loadSpy = { count: 0 };
    const spy = vi
      .spyOn(permissions, "roleHasPermission")
      .mockImplementation((role, permission) => {
        if (permission === "inventory.read") {
          return false;
        }
        return permissions.permissionsForRole(role).has(permission);
      });
    try {
      const result = await runGuardedMerchantResearch(
        baseInput(),
        ports({ preview: true, loadSpy }),
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("PERMISSION_DENIED");
      }
      expect(loadSpy.count).toBe(0);
    } finally {
      spy.mockRestore();
    }
  });

  it("rejects wrong grain with preview enabled after auth", async () => {
    const result = await runGuardedMerchantResearch(
      baseInput({
        variantId: "55555555-5555-4555-8555-555555555555",
      }),
      ports({ preview: true }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.code).toBe("GRAIN_NOT_FOUND");
  });

  it("rejects unsupported competitor / zero-sales intents and deep depth", async () => {
    const competitor = await runGuardedMerchantResearch(
      baseInput({ intentClass: "competitor_research" }),
      ports({ preview: true }),
    );
    expect(competitor.ok).toBe(false);
    if (!competitor.ok) {
      expect(competitor.code).toBe("UNSUPPORTED_INTENT");
    }

    const zeroSales = await runGuardedMerchantResearch(
      baseInput({ intentClass: "zero_sales_diagnosis" }),
      ports({ preview: true }),
    );
    expect(zeroSales.ok).toBe(false);
    if (!zeroSales.ok) {
      expect(zeroSales.code).toBe("UNSUPPORTED_INTENT");
    }

    const deep = await runGuardedMerchantResearch(
      baseInput({ depth: "deep" }),
      ports({ preview: true }),
    );
    expect(deep.ok).toBe(false);
    if (!deep.ok) {
      expect(deep.code).toBe("UNSUPPORTED_DEPTH");
    }
  });

  it("runs valid isolated preview through the actual 1d pipeline", async () => {
    const result = await runGuardedMerchantResearch(
      baseInput(),
      ports({ preview: true }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.kind === "answered" || result.kind === "partial" || result.kind === "abstained").toBe(
      true,
    );
    if (result.kind === "answered" || result.kind === "partial") {
      expect(result.originClass).toBe("synthetic_fixture");
      expect(result.syntheticOriginPreserved).toBe(true);
      expect(result.isRealMerchantOrMarketFact).toBe(false);
      expect(result.promotableToL1Findings).toBe(false);
      expect(result.syntheticPreviewWarning.length).toBeGreaterThan(20);
      expect(result.findings.every((f) => f.syntheticOriginPreserved)).toBe(
        true,
      );
      // Free-form draft prose omitted from DTO.
      expect(
        Object.prototype.hasOwnProperty.call(result, "researchAnswer"),
      ).toBe(false);
      assertMerchantResearchSafeDto(result);
    }
  });

  it("preserves partial / conflict / insufficient honesty classes in DTO path", async () => {
    const abstained = toMerchantResearchDto({
      result: {
        status: "abstained",
        schemaVersion: "market-research-orchestration-v1",
        runId: "run-1",
        code: "INSUFFICIENT_EVIDENCE",
        detail: "No accepted evidence",
        reasonCodes: ["INSUFFICIENT_EVIDENCE"],
        limitations: ["no_accepted_evidence"],
        findings: [],
        evidenceIds: [],
        conflicts: [],
        abstentions: [],
        originClass: "synthetic_fixture",
        syntheticOriginPreserved: true,
        isRealMerchantOrMarketFact: false,
        promotableToL1Findings: false,
        generator: "none",
        trace: {
          schemaVersion: "market-research-orchestration-v1",
          runId: "run-1",
          startedAt: NOW,
          endedAt: NOW,
          steps: [],
          bounds: {
            maxSteps: 6,
            maxToolCalls: 1,
            deadlineMs: 2000,
            maxRetries: 0,
            maxPayloadBytes: 64000,
            maxDraftChars: 2000,
          },
          spend: {
            actualSpend: 0,
            credits: 0,
            tokenEstimateIn: 0,
            tokenEstimateOut: 0,
            adapterCalls: 0,
            failedAttempts: 0,
            retriesUsed: 0,
          },
        },
        spend: {
          actualSpend: 0,
          credits: 0,
          tokenEstimateIn: 0,
          tokenEstimateOut: 0,
          adapterCalls: 0,
          failedAttempts: 0,
          retriesUsed: 0,
        },
        producedFindings: false,
      } as MarketResearchOrchestrationResult,
      clientRequestId: "req-abs",
      intentClass: "market_opportunity",
      countryCode: "AE",
      depth: "quick_lookup",
    });
    expect(abstained.kind).toBe("abstained");
    if (abstained.kind === "abstained") {
      expect(abstained.code).toBe("INSUFFICIENT_EVIDENCE");
      expect(abstained.merchantMessage).toMatch(/Not enough accepted/i);
      expect(abstained.syntheticPreviewWarning).toMatch(/Synthetic preview/i);
    }
    assertMerchantResearchSafeDto(abstained);
  });

  it("blocks production synthetic unlock via forbidden env overrides", () => {
    const probe = detectForbiddenSyntheticEnvOverrides({
      NODE_ENV: "test",
      STOREAGENT_MARKET_RESEARCH_ALLOW_SYNTHETIC: "true",
      STOREAGENT_MARKET_RESEARCH_FIXTURE_ID: "openai_success_citations_v1",
    } as NodeJS.ProcessEnv);
    expect(probe.blocked).toBe(true);
    expect(probe.keysPresent.length).toBeGreaterThan(0);

    const production = assertProductionMarketResearchExecutionForbidden();
    expect(production.syntheticAllowed).toBe(false);
    expect(production.liveAllowed).toBe(false);
    expect(production.deployableFixtureOverrideAllowed).toBe(false);
    expect(production.publicDemoEndpointAllowed).toBe(false);
  });

  it("refuses production path when forbidden env overrides are present", async () => {
    const previous = process.env.STOREAGENT_MARKET_RESEARCH_ALLOW_SYNTHETIC;
    process.env.STOREAGENT_MARKET_RESEARCH_ALLOW_SYNTHETIC = "true";
    try {
      const loadSpy = { count: 0 };
      const result = await runGuardedMerchantResearch(
        baseInput(),
        ports({ loadSpy }),
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("PREVIEW_ISOLATION_VIOLATION");
      }
      expect(loadSpy.count).toBe(0);
    } finally {
      if (previous === undefined) {
        delete process.env.STOREAGENT_MARKET_RESEARCH_ALLOW_SYNTHETIC;
      } else {
        process.env.STOREAGENT_MARKET_RESEARCH_ALLOW_SYNTHETIC = previous;
      }
    }
  });

  it("isolates stale / cross-context responses and supports cancel discard helpers", () => {
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
        responseClientRequestId: "mr:aaa:111",
        responseIntentClass: "market_opportunity",
        responseCountryCode: "AE",
        responseDepth: "quick_lookup",
        grainKey: latest.grainKey,
      }),
    ).toBe(true);
    expect(
      isCurrentMarketResearchResponse({
        latest,
        responseClientRequestId: "mr:bbb:222",
        responseIntentClass: "market_opportunity",
        responseCountryCode: "AE",
        responseDepth: "quick_lookup",
        grainKey: latest.grainKey,
      }),
    ).toBe(false);
    expect(
      isCurrentMarketResearchResponse({
        latest,
        responseClientRequestId: "mr:aaa:111",
        responseIntentClass: "market_opportunity",
        responseCountryCode: "US",
        responseDepth: "quick_lookup",
        grainKey: latest.grainKey,
      }),
    ).toBe(false);
    expect(
      isCurrentMarketResearchResponse({
        latest: null,
        responseClientRequestId: "mr:aaa:111",
        responseIntentClass: "market_opportunity",
        grainKey: latest.grainKey,
      }),
    ).toBe(false);

    const id = createMarketResearchClientRequestId(1, "abc");
    expect(id.startsWith("mr:")).toBe(true);
  });

  it("discards cancelled preview runs without claiming server cancel unless aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await runGuardedMerchantResearch(
      baseInput(),
      ports({ preview: true, signal: controller.signal }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    // Orchestration may abstain/error on cancel; DTO must not invent findings.
    if (result.kind === "answered" || result.kind === "partial") {
      // If somehow answered, findings still synthetic-only.
      expect(result.syntheticOriginPreserved).toBe(true);
    } else {
      expect(result.kind).toBe("abstained");
    }
  });

  it("builds trusted target attributes from grain only", () => {
    const target = buildTrustedTargetProductFromRow(row());
    expect(target.title).toContain("BlendCo");
    expect(target.role).toBe("product");
    expect(
      Object.prototype.hasOwnProperty.call(target, "licenseOk"),
    ).toBe(false);
  });

  it("keeps panel soft-show default OFF and separate from orchestration", () => {
    expect(
      mayShowMarketResearchPanel({
        organizationId: ORG,
        researchEnabled: false,
        allowlistMatch: false,
      }),
    ).toBe(false);
    expect(
      mayShowMarketResearchPanel({
        organizationId: ORG,
        researchEnabled: true,
        allowlistMatch: true,
      }),
    ).toBe(true);
  });

  it("forbids client override keys on the public action surface", () => {
    const actionSrc = read("lib/market-research/actions.ts");
    const merchantSrc = read("lib/market-research/merchant-research.ts");
    for (const key of FORBIDDEN_MERCHANT_RESEARCH_CLIENT_KEYS) {
      expect(actionSrc).not.toMatch(
        new RegExp(`input\\.${key}|body\\.${key}`),
      );
    }
    expect(merchantSrc).toContain("FORBIDDEN_MERCHANT_RESEARCH_CLIENT_KEYS");
    expect(FORBIDDEN_SYNTHETIC_ENV_OVERRIDE_KEYS.length).toBeGreaterThan(0);
    // No public demo route.
    expect(fs.existsSync(path.join(ROOT, "app/api/market-research"))).toBe(
      false,
    );
  });

  it("hides market research panel by default in inspector / page wiring", () => {
    const inspector = read("components/inventory/sku-intelligence-inspector.tsx");
    const page = read(
      "app/(app)/app/[organizationId]/inventory/page.tsx",
    );
    const panel = read("components/inventory/sku-market-research-panel.tsx");
    expect(inspector).toContain("marketResearchVisible = false");
    expect(inspector).toContain("SkuMarketResearchPanel");
    expect(page).toContain("mayShowMarketResearchPanel");
    expect(page).toContain("marketResearchVisible");
    expect(panel).toContain("if (!visible)");
    expect(panel).toContain("SYNTHETIC_PREVIEW_WARNING");
    // No auto-run on mount.
    expect(panel).not.toMatch(/useEffect\([^)]*runResearch/);
    expect(panel).toContain("Nothing runs until you");
  });

  it("maps merchant-safe errors without leaking internals", () => {
    const dto = merchantResearchError({
      code: "RESEARCH_DISABLED",
      error: "Market research is not enabled for this organization.",
      clientRequestId: "req-x",
    });
    assertMerchantResearchSafeDto(dto);
    expect(dto.ok).toBe(false);
  });

  it("preserves AI-ARCH commerce-agent panel wiring when market research is hidden", () => {
    const inspector = read("components/inventory/sku-intelligence-inspector.tsx");
    expect(inspector).toContain("SkuCommerceAgentPanel");
    expect(inspector).toContain("commerceAgentVisible");
    expect(inspector).toContain("SkuExplainerPanel");
  });
});
