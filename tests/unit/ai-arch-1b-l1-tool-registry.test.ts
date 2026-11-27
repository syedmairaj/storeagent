import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildTrustedMerchantContext,
  createFixtureL1ToolDeps,
  getL1ToolDefinition,
  invokeL1Tool,
  isExplicitlyForbiddenToolId,
  isL1ToolId,
  listL1ToolIds,
  L1_TOOL_IDS,
  type L1ToolDeps,
} from "@/lib/commerce-agent";
import type { MerchantInventoryIntelligenceRow } from "@/lib/inventory-intelligence/types";
import type { MerchantPlanningInputs } from "@/lib/planning-inputs/types";

const ORG = "11111111-1111-4111-8111-111111111111";
const STORE = "22222222-2222-4222-8222-222222222222";
const LOCATION = "33333333-3333-4333-8333-333333333333";
const VARIANT = "44444444-4444-4444-8444-444444444444";
const OTHER_ORG = "99999999-9999-4999-8999-999999999999";
const OTHER_STORE = "55555555-5555-4555-8555-555555555555";

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
    sku: "SKU-1",
    productTitle: "Cotton Tee",
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

function context(permissions: string[] = ["inventory.read", "stores.read"]) {
  return buildTrustedMerchantContext({
    userId: "user-1",
    organizationId: ORG,
    role: "owner",
    permissions: permissions as never,
    storeId: STORE,
    asOf: "2026-11-27T00:00:00.000Z",
  });
}

function deps(rows = [row()], planning?: MerchantPlanningInputs | null): L1ToolDeps {
  const planningByOrg = new Map<string, MerchantPlanningInputs | null>();
  if (planning !== undefined) {
    planningByOrg.set(ORG, planning);
  }
  return createFixtureL1ToolDeps({ rows, planningByOrg });
}

describe("AI-ARCH-1b L1 tool registry", () => {
  it("exposes a literal allowlist of read_only tools only", () => {
    expect([...L1_TOOL_IDS]).toEqual([
      "inventory.get_sku_intelligence",
      "inventory.build_explainer_evidence",
      "inventory.classify_guidance_situation",
      "planning.get_inputs",
    ]);
    expect(listL1ToolIds()).toEqual([...L1_TOOL_IDS]);
    for (const id of L1_TOOL_IDS) {
      expect(isL1ToolId(id)).toBe(true);
      expect(getL1ToolDefinition(id).sideEffectClass).toBe("read_only");
    }
  });

  it("rejects unsupported and write-capable / external tool ids", async () => {
    const result = await invokeL1Tool({
      toolId: "web_search.market",
      context: context(),
      deps: deps(),
      input: {},
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("FORBIDDEN_TOOL");
    }

    expect(isExplicitlyForbiddenToolId("oauth.connect")).toBe(true);
    expect(isExplicitlyForbiddenToolId("sync.run")).toBe(true);
    expect(isExplicitlyForbiddenToolId("metrics.enqueue")).toBe(true);
    expect(isExplicitlyForbiddenToolId("m7.create")).toBe(true);
    expect(isExplicitlyForbiddenToolId("inventory.save_row")).toBe(true);

    const unknown = await invokeL1Tool({
      toolId: "inventory.invent_metrics",
      context: context(),
      deps: deps(),
    });
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) {
      expect(["UNSUPPORTED_TOOL", "FORBIDDEN_TOOL"]).toContain(unknown.code);
    }
  });

  it("invokes inventory.get_sku_intelligence when authorized", async () => {
    const result = await invokeL1Tool({
      toolId: "inventory.get_sku_intelligence",
      context: context(),
      deps: deps(),
      input: {
        storeId: STORE,
        locationId: LOCATION,
        variantId: VARIANT,
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.execution).toBe("success");
    expect(result.recommendationEligibility).toBe("explain_only");
    expect(result.evidenceVerification).toBe("verified");
    expect(result.output).toMatchObject({
      row: { sku: "SKU-1", organizationId: ORG },
    });
  });

  it("rejects missing permission", async () => {
    const result = await invokeL1Tool({
      toolId: "inventory.get_sku_intelligence",
      context: context(["stores.read"]),
      deps: deps(),
      input: {
        storeId: STORE,
        locationId: LOCATION,
        variantId: VARIANT,
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("PERMISSION_DENIED");
    }
  });

  it("rejects wrong tenant / store / sku scope", async () => {
    const wrongOrg = await invokeL1Tool({
      toolId: "inventory.get_sku_intelligence",
      context: context(),
      deps: deps(),
      input: {
        organizationId: OTHER_ORG,
        storeId: STORE,
        locationId: LOCATION,
        variantId: VARIANT,
      },
    });
    expect(wrongOrg.ok).toBe(false);
    if (!wrongOrg.ok) {
      expect(wrongOrg.code).toBe("TENANT_SCOPE_MISMATCH");
    }

    const wrongStore = await invokeL1Tool({
      toolId: "inventory.get_sku_intelligence",
      context: context(),
      deps: deps(),
      input: {
        storeId: OTHER_STORE,
        locationId: LOCATION,
        variantId: VARIANT,
      },
    });
    expect(wrongStore.ok).toBe(false);
    if (!wrongStore.ok) {
      expect(wrongStore.code).toBe("TENANT_SCOPE_MISMATCH");
    }

    const notFound = await invokeL1Tool({
      toolId: "inventory.get_sku_intelligence",
      context: context(),
      deps: deps([]),
      input: {
        storeId: STORE,
        locationId: LOCATION,
        variantId: VARIANT,
      },
    });
    expect(notFound.ok).toBe(false);
    if (!notFound.ok) {
      expect(notFound.code).toBe("NOT_FOUND");
    }
  });

  it("rejects malformed input", async () => {
    const result = await invokeL1Tool({
      toolId: "inventory.get_sku_intelligence",
      context: context(),
      deps: deps(),
      input: { storeId: "not-a-uuid", locationId: LOCATION, variantId: VARIANT },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("MALFORMED_INPUT");
    }
  });

  it("rejects source/evidence mismatch from a lying port", async () => {
    const lying: L1ToolDeps = {
      getSkuIntelligence: async () =>
        row({
          storeId: OTHER_STORE,
          grainKey: `${OTHER_STORE}:${LOCATION}:${VARIANT}`,
        }),
      getPlanningInputs: async () => null,
    };

    const result = await invokeL1Tool({
      toolId: "inventory.get_sku_intelligence",
      context: buildTrustedMerchantContext({
        userId: "user-1",
        organizationId: ORG,
        role: "owner",
        permissions: ["inventory.read"],
        // no pinned store — org match passes, grain mismatch still caught
        asOf: "2026-11-27T00:00:00.000Z",
      }),
      deps: lying,
      input: {
        storeId: STORE,
        locationId: LOCATION,
        variantId: VARIANT,
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("EVIDENCE_MISMATCH");
    }
  });

  it("builds explainer evidence and maps without inventing thresholds", async () => {
    const partialRow = row({
      coverStatus: "short_history",
      daysOfStock: null,
      daysOfStockReasonCode: "insufficient_history",
      safetyStock: null,
      safetyStockReasonCode: "planning_incomplete",
      reorderPoint: null,
      reorderPointReasonCode: "planning_incomplete",
      targetStock: null,
      targetStockReasonCode: "planning_incomplete",
      salesVelocity30d: null,
      salesVelocity30dReasonCode: "insufficient_history",
      eligibleDays30d: 2,
    });

    const result = await invokeL1Tool({
      toolId: "inventory.build_explainer_evidence",
      context: context(),
      deps: deps([partialRow]),
      input: {
        row: partialRow,
        stockObservationsStale: false,
        planning: null,
        incomingTrust: "unknown",
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.evidenceVerification).toBe("partial");
    expect(result.recommendationEligibility).toBe("explain_only");
    const output = result.output as {
      bundle: {
        calculations: { inventoryFactId?: string }[];
        missingLabels: string[];
      };
    };
    expect(output.bundle.missingLabels.length).toBeGreaterThan(0);
    expect(
      output.bundle.calculations.some((c) => c.inventoryFactId === "safety_stock"),
    ).toBe(false);
  });

  it("preserves stale freshness and requires explicit stale boolean", async () => {
    const missingStale = await invokeL1Tool({
      toolId: "inventory.build_explainer_evidence",
      context: context(),
      deps: deps(),
      input: { row: row() },
    });
    expect(missingStale.ok).toBe(false);
    if (!missingStale.ok) {
      expect(missingStale.code).toBe("MALFORMED_INPUT");
    }

    const stale = await invokeL1Tool({
      toolId: "inventory.build_explainer_evidence",
      context: context(),
      deps: deps(),
      input: {
        row: row(),
        stockObservationsStale: true,
      },
    });
    expect(stale.ok).toBe(true);
    if (!stale.ok) {
      return;
    }
    const output = stale.output as {
      bundle: { freshnessClass: string; uncertainty: string[] };
    };
    expect(output.bundle.freshnessClass).toBe("stale");
    expect(output.bundle.uncertainty.some((u) => /stale/i.test(u))).toBe(true);
  });

  it("classifies guidance situation from observed evidence", async () => {
    const zeroSales = row({
      availableQuantity: 40,
      salesVelocity30d: 0,
      coverStatus: "zero_demand",
      daysOfStock: 999,
    });
    const result = await invokeL1Tool({
      toolId: "inventory.classify_guidance_situation",
      context: context(),
      deps: deps([zeroSales]),
      input: {
        row: zeroSales,
        stockObservationsStale: false,
        incomingTrust: "unknown",
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const output = result.output as {
      situation: { id: string; untestedHypotheses: string[] };
    };
    expect(output.situation.id).toMatch(/zero|in_stock/i);
    expect(output.situation.untestedHypotheses.length).toBeGreaterThan(0);
  });

  it("reads planning inputs with null≠0 semantics", async () => {
    const planning: MerchantPlanningInputs = {
      leadTimeDays: 7,
      safetyStockDays: null,
      reviewPeriodDays: 7,
    };
    const result = await invokeL1Tool({
      toolId: "planning.get_inputs",
      context: context(),
      deps: deps([row()], planning),
      input: {},
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const output = result.output as {
      planning: MerchantPlanningInputs;
      present: boolean;
    };
    expect(output.present).toBe(true);
    expect(output.planning.safetyStockDays).toBeNull();
    expect(output.planning.leadTimeDays).toBe(7);

    const missing = await invokeL1Tool({
      toolId: "planning.get_inputs",
      context: context(),
      deps: deps([row()], null),
      input: { organizationId: OTHER_ORG },
    });
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.code).toBe("TENANT_SCOPE_MISMATCH");
    }
  });

  it("handles timeout safely without inventing output", async () => {
    const slow: L1ToolDeps = {
      getSkuIntelligence: async () => {
        await new Promise((r) => setTimeout(r, 50));
        return row();
      },
      getPlanningInputs: async () => null,
    };

    const result = await invokeL1Tool({
      toolId: "inventory.get_sku_intelligence",
      context: context(),
      deps: slow,
      timeoutMs: 5,
      input: {
        storeId: STORE,
        locationId: LOCATION,
        variantId: VARIANT,
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("TIMEOUT");
      expect(result.recommendationEligibility).toBe("not_eligible");
    }
  });
});

describe("AI-ARCH-1b architecture fences", () => {
  const ROOT = process.cwd();

  function read(relative: string): string {
    return fs.readFileSync(path.join(ROOT, relative), "utf8");
  }

  function listSourceFiles(relativeRoot: string): string[] {
    const absolute = path.join(ROOT, relativeRoot);
    const out: string[] = [];
    function walk(dir: string): void {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          walk(path.join(dir, entry.name));
          continue;
        }
        if (![".ts", ".tsx"].includes(path.extname(entry.name))) {
          continue;
        }
        out.push(path.relative(ROOT, path.join(dir, entry.name)));
      }
    }
    walk(absolute);
    return out.sort();
  }

  it("keeps tool registry offline — no live loaders, fetch, oauth, sync, or orchestrator", () => {
    const files = listSourceFiles("lib/commerce-agent/tools");
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = read(file);
      const lower = source.toLowerCase();
      expect(lower).not.toContain("loadmerchantinventoryintelligence");
      expect(lower).not.toContain("loadmerchantplanninginputs");
      expect(lower).not.toContain("createsupabase");
      expect(lower).not.toMatch(/\bfetch\s*\(/);
      expect(lower).not.toContain("openai");
      expect(lower).not.toContain("syncrun");
      expect(lower).not.toContain("createinventoryaction");
      expect(source).not.toContain("supportsLiveNetwork: true");
    }
  });

  it("does not mutate M5–M7 calculation engines", () => {
    const invoke = read("lib/commerce-agent/tools/invoke.ts");
    expect(invoke).not.toContain("lib/metrics/inventory-math");
    expect(invoke).not.toContain("decideInventoryAction");
  });
});
