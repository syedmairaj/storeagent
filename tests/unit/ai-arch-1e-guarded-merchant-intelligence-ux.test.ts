import fs from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  assertMerchantSafeDto,
  COMMERCE_AGENT_STRUCTURED_INTENTS,
  createCommerceAgentClientRequestId,
  createFixtureL1ToolDeps,
  FORBIDDEN_CLIENT_OVERRIDE_KEYS,
  isCurrentCommerceAgentResponse,
  merchantInvestigationError,
  runGuardedMerchantInvestigation,
  toMerchantInvestigationDto,
  type L1ToolDeps,
  type MerchantInvestigationPorts,
} from "@/lib/commerce-agent";
import type { MerchantInventoryIntelligenceRow } from "@/lib/inventory-intelligence/types";
import type { MerchantPlanningInputs } from "@/lib/planning-inputs/types";
import * as permissions from "@/lib/tenancy/permissions";

const ROOT = path.resolve(__dirname, "../..");

const ORG = "11111111-1111-4111-8111-111111111111";
const STORE = "22222222-2222-4222-8222-222222222222";
const LOCATION = "33333333-3333-4333-8333-333333333333";
const VARIANT = "44444444-4444-4444-8444-444444444444";
const OTHER_ORG = "99999999-9999-4999-8999-999999999999";

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

function planning(): MerchantPlanningInputs {
  return {
    leadTimeDays: 7,
    safetyStockDays: 5,
    reviewPeriodDays: 7,
  };
}

function baseInput(
  overrides: Partial<{
    organizationId: string;
    storeId: string;
    locationId: string;
    variantId: string;
    intentClass: string;
    clientRequestId: string;
    stockObservationsStaleHint: boolean;
  }> = {},
) {
  return {
    organizationId: ORG,
    storeId: STORE,
    locationId: LOCATION,
    variantId: VARIANT,
    intentClass: "inventory_fact",
    clientRequestId: "req-test-001",
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
  toolCallSpy?: { count: number };
}): MerchantInvestigationPorts {
  const rows = input.rows ?? [row()];
  const planningByOrg = new Map([[ORG, planning()]]);
  const deps = createFixtureL1ToolDeps({ rows, planningByOrg });

  const wrappedDeps: L1ToolDeps = {
    getSkuIntelligence: async (args) => {
      if (input.toolCallSpy) {
        input.toolCallSpy.count += 1;
      }
      return deps.getSkuIntelligence(args);
    },
    getPlanningInputs: async (args) => {
      if (input.toolCallSpy) {
        input.toolCallSpy.count += 1;
      }
      return deps.getPlanningInputs(args);
    },
  };

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
      if (input.toolCallSpy) {
        // loadIntelligenceRows is post-enablement grain proof, not an L1 tool.
      }
      return rows;
    },
    createToolDeps: () => wrappedDeps,
    readConfig: () => ({
      enabled: input.enabled ?? false,
      organizationAllowlist: input.allowlist ?? [],
    }),
  };
}

describe("AI-ARCH-1e guarded merchant intelligence UX", () => {
  it("defaults soft-enable OFF and rejects before tool calls", async () => {
    const spy = { count: 0 };
    const loadSpy = vi.fn(async () => [row()]);
    const result = await runGuardedMerchantInvestigation(baseInput(), {
      ...ports({ toolCallSpy: spy }),
      loadIntelligenceRows: loadSpy,
    });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.code).toBe("AGENT_DISABLED");
    expect(loadSpy).not.toHaveBeenCalled();
    expect(spy.count).toBe(0);
  });

  it("denies enabled-but-not-allowlisted organizations before loads/tools", async () => {
    const spy = { count: 0 };
    const loadSpy = vi.fn(async () => [row()]);
    const result = await runGuardedMerchantInvestigation(baseInput(), {
      ...ports({
        enabled: true,
        allowlist: [OTHER_ORG],
        toolCallSpy: spy,
      }),
      loadIntelligenceRows: loadSpy,
    });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.code).toBe("AGENT_DISABLED");
    expect(loadSpy).not.toHaveBeenCalled();
    expect(spy.count).toBe(0);
  });

  it("rejects unauthenticated callers with zero evidence loads", async () => {
    const spy = { count: 0 };
    const loadSpy = vi.fn(async () => [row()]);
    const result = await runGuardedMerchantInvestigation(baseInput(), {
      ...ports({
        unauthenticated: true,
        enabled: true,
        allowlist: [ORG],
        toolCallSpy: spy,
      }),
      loadIntelligenceRows: loadSpy,
    });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.code).toBe("UNAUTHORIZED");
    expect(loadSpy).not.toHaveBeenCalled();
    expect(spy.count).toBe(0);
  });

  it("rejects wrong tenant membership with zero evidence loads", async () => {
    const spy = { count: 0 };
    const loadSpy = vi.fn(async () => [row()]);
    const result = await runGuardedMerchantInvestigation(
      baseInput({ organizationId: OTHER_ORG }),
      {
        ...ports({
          enabled: true,
          allowlist: [OTHER_ORG],
          orgDenied: true,
          toolCallSpy: spy,
        }),
        loadIntelligenceRows: loadSpy,
      },
    );
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.code).toBe("UNAUTHORIZED");
    expect(loadSpy).not.toHaveBeenCalled();
    expect(spy.count).toBe(0);
  });

  it("rejects missing inventory.read permission and wrong grain", async () => {
    const toolSpy = { count: 0 };
    const loadSpy = vi.fn(async () => [row()]);
    const spy = vi
      .spyOn(permissions, "roleHasPermission")
      .mockImplementation((_role, permission) => permission !== "inventory.read");
    try {
      const denied = await runGuardedMerchantInvestigation(baseInput(), {
        ...ports({
          enabled: true,
          allowlist: [ORG],
          toolCallSpy: toolSpy,
        }),
        loadIntelligenceRows: loadSpy,
      });
      expect(denied.ok).toBe(false);
      if (!denied.ok) {
        expect(denied.code).toBe("PERMISSION_DENIED");
      }
      expect(loadSpy).not.toHaveBeenCalled();
      expect(toolSpy.count).toBe(0);
    } finally {
      spy.mockRestore();
    }

    const grainToolSpy = { count: 0 };
    const grainMiss = await runGuardedMerchantInvestigation(
      baseInput({
        storeId: "55555555-5555-4555-8555-555555555555",
      }),
      ports({
        enabled: true,
        allowlist: [ORG],
        toolCallSpy: grainToolSpy,
      }),
    );
    expect(grainMiss.ok).toBe(false);
    if (!grainMiss.ok) {
      expect(grainMiss.code).toBe("GRAIN_NOT_FOUND");
    }
    // Grain proof may load intelligence rows, but L1 tools must not run.
    expect(grainToolSpy.count).toBe(0);
  });

  it("rejects malformed grain and unsupported intents", async () => {
    const badGrain = await runGuardedMerchantInvestigation(
      baseInput({ storeId: "not-a-uuid" }),
      ports({ enabled: true, allowlist: [ORG] }),
    );
    expect(badGrain.ok).toBe(false);
    if (!badGrain.ok) {
      expect(badGrain.code).toBe("INVALID_INPUT");
    }

    const badIntent = await runGuardedMerchantInvestigation(
      baseInput({ intentClass: "competitor_research" }),
      ports({ enabled: true, allowlist: [ORG] }),
    );
    expect(badIntent.ok).toBe(false);
    if (!badIntent.ok) {
      expect(badIntent.code).toBe("UNSUPPORTED_INTENT");
    }

    const badRequestId = await runGuardedMerchantInvestigation(
      baseInput({ clientRequestId: "x" }),
      ports({ enabled: true, allowlist: [ORG] }),
    );
    expect(badRequestId.ok).toBe(false);
    if (!badRequestId.ok) {
      expect(badRequestId.code).toBe("INVALID_INPUT");
    }
  });

  it("never accepts forged client overrides in the public action contract", () => {
    const actions = read("lib/commerce-agent/actions.ts");
    const investigation = read("lib/commerce-agent/merchant-investigation.ts");
    const inputType = read("lib/commerce-agent/merchant-investigation.ts");
    for (const key of FORBIDDEN_CLIENT_OVERRIDE_KEYS) {
      expect(actions).not.toContain(`input.${key}`);
      expect(inputType).not.toMatch(
        new RegExp(`MerchantInvestigationInput[\\s\\S]{0,400}${key}\\s*\\?:`),
      );
    }
    expect(actions).not.toContain("forceEnabled:");
    expect(actions).not.toContain("draftAdapter:");
    expect(actions).not.toContain("forceEnabled: true");
    expect(investigation).toContain("forceEnabled intentionally omitted");
    expect(investigation).toContain("FORBIDDEN_CLIENT_OVERRIDE_KEYS");
  });

  it("returns a grounded answered DTO for a valid enablelisted request", async () => {
    const spy = { count: 0 };
    const result = await runGuardedMerchantInvestigation(
      baseInput(),
      ports({
        enabled: true,
        allowlist: [ORG],
        toolCallSpy: spy,
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.kind).toBe("answered");
    if (result.kind !== "answered") {
      return;
    }
    expect(result.merchantAnswer.length).toBeGreaterThan(8);
    expect(result.generator).toMatch(/deterministic|ai_validated|fallback/);
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.recommendedAction.requiresHumanApproval).toBe(true);
    expect(result.recommendedAction.approvalBoundary).not.toBeUndefined();
    expect(spy.count).toBeGreaterThan(0);
    assertMerchantSafeDto(result);
    expect(JSON.stringify(result)).not.toContain("forceEnabled");
    expect(JSON.stringify(result)).not.toContain("organizationAllowlist");
    expect(JSON.stringify(result)).not.toContain('"trace"');
  });

  it("maps abstention/fallback safely without leaking traces", async () => {
    const staleRow = row({ coverStatus: "stale" });
    const result = await runGuardedMerchantInvestigation(
      baseInput({ intentClass: "reorder_review" }),
      ports({
        enabled: true,
        allowlist: [ORG],
        rows: [staleRow],
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.kind).toBe("abstained");
    if (result.kind !== "abstained") {
      return;
    }
    expect(result.code).toBe("STALE_EVIDENCE");
    expect(result.merchantMessage.length).toBeGreaterThan(0);
    assertMerchantSafeDto(result);
    expect(JSON.stringify(result)).not.toContain('"steps"');
  });

  it("isolates stale responses when SKU/intent/request id diverge", () => {
    const latest = {
      clientRequestId: "req-a",
      grainKey: `${STORE}:${LOCATION}:${VARIANT}`,
      intentClass: "inventory_fact" as const,
    };
    expect(
      isCurrentCommerceAgentResponse({
        latest,
        responseClientRequestId: "req-a",
        responseIntentClass: "inventory_fact",
        grainKey: latest.grainKey,
      }),
    ).toBe(true);
    expect(
      isCurrentCommerceAgentResponse({
        latest,
        responseClientRequestId: "req-b",
        responseIntentClass: "inventory_fact",
        grainKey: latest.grainKey,
      }),
    ).toBe(false);
    expect(
      isCurrentCommerceAgentResponse({
        latest,
        responseClientRequestId: "req-a",
        responseIntentClass: "data_gap",
        grainKey: latest.grainKey,
      }),
    ).toBe(false);
    expect(
      isCurrentCommerceAgentResponse({
        latest,
        responseClientRequestId: "req-a",
        responseIntentClass: "inventory_fact",
        grainKey: "other",
      }),
    ).toBe(false);
    expect(createCommerceAgentClientRequestId(1, "abcdef12")).toMatch(
      /^ca:/,
    );
  });

  it("keeps merchant DTO serialization free of sensitive keys", () => {
    const err = merchantInvestigationError({
      code: "AGENT_DISABLED",
      error: "off",
      clientRequestId: "req-1",
    });
    assertMerchantSafeDto(err);

    const answered = toMerchantInvestigationDto({
      clientRequestId: "req-1",
      intentClass: "inventory_fact",
      result: {
        status: "answered",
        merchantAnswer: "SKU SKU-1: cover looks healthy.",
        findings: [
          {
            claimId: "c1",
            text: "Available 10",
            claimClass: "observed_fact",
            evidenceIds: ["e1"],
            verified: true,
          },
        ],
        evidence: [
          {
            evidenceId: "e1",
            claimClass: "observed_fact",
            label: "Available",
            value: "10",
            sourceSystem: "inventory_intelligence",
            organizationId: ORG,
            licenseOk: true,
            asOf: "2026-11-20",
            freshnessClass: "current",
          },
        ],
        calculations: [],
        uncertainty: [],
        recommendedAction: {
          recommendationId: "r1",
          actionClass: "review",
          summary: "Review stock",
          requiresHumanApproval: true,
          approvalBoundary: "merchant_required",
        },
        nextSteps: [{ code: "refresh", label: "Refresh observations" }],
        approvalBoundary: "merchant_required",
        evidenceHash: "hash",
        generator: "deterministic",
        trace: {
          schemaVersion: "commerce-agent-trace-v1",
          runId: "run",
          clientRequestId: "req-1",
          organizationId: ORG,
          startedAt: "2026-11-27T00:00:00.000Z",
          steps: [],
        },
      },
    });
    assertMerchantSafeDto(answered);
    expect("trace" in answered).toBe(false);
  });

  it("wires structured intents into the SKU inspector with honesty fences", () => {
    const inspector = read(
      "components/inventory/sku-intelligence-inspector.tsx",
    );
    const panel = read("components/inventory/sku-commerce-agent-panel.tsx");
    const page = read(
      "app/(app)/app/[organizationId]/inventory/page.tsx",
    );
    const workspace = read(
      "components/inventory/inventory-intelligence-workspace.tsx",
    );

    expect(inspector).toContain("SkuCommerceAgentPanel");
    expect(inspector).toContain("key={row.grainKey}");
    expect(inspector).toContain("commerceAgentVisible");
    expect(workspace).toContain("commerceAgentVisible");
    expect(page).toContain("mayRunCommerceAgent");
    expect(page).toContain("commerceAgentVisible");

    expect(panel).toContain('data-sku-commerce-agent="true"');
    expect(panel).toContain("COMMERCE_AGENT_STRUCTURED_INTENTS");
    expect(panel).toContain("isCurrentCommerceAgentResponse");
    expect(panel).toContain("runCommerceAgentInvestigationAction");
    expect(panel).toContain("Hypothesis");
    expect(panel).toContain("Human approval required");
    expect(panel).toContain("no buy or create");
    expect(panel).toContain("focus-visible:ring-2");
    expect(panel).toContain("min-h-11");
    expect(panel).toContain("aria-live");
    expect(panel).toContain("sm:grid-cols-2");
    expect(panel).not.toContain("textarea");
    expect(panel).not.toContain("contenteditable");
    expect(panel).not.toContain("forceEnabled");
    expect(panel).not.toContain("fetch(");

    expect(COMMERCE_AGENT_STRUCTURED_INTENTS.map((i) => i.id)).toEqual([
      "inventory_fact",
      "zero_sales_diagnosis",
      "data_gap",
      "reorder_review",
    ]);
  });

  it("keeps the server action auth/enablement/grain contract closed", () => {
    const actions = read("lib/commerce-agent/actions.ts");
    const core = read("lib/commerce-agent/merchant-investigation.ts");
    expect(actions).toContain('"use server"');
    expect(actions).toContain("requireAppIdentity");
    expect(actions).toContain("resolveServerOrganizationContext");
    expect(actions).toContain("createAuthorizedL1ToolDeps");
    expect(actions).toContain("runGuardedMerchantInvestigation");
    expect(actions).not.toContain("createInventoryAction");
    expect(actions).not.toContain("decideInventoryAction");
    expect(actions).not.toContain("service_role");

    expect(core).toContain('inventory.read');
    expect(core).toContain("mayRunCommerceAgent");
    expect(core).toContain("loadIntelligenceRows");
    expect(core).toContain("AGENT_DISABLED");
    expect(core).toContain("GRAIN_NOT_FOUND");
    expect(core).toContain("assertMerchantSafeDto");

    const envExample = read(".env.example");
    expect(envExample).toContain("STOREAGENT_COMMERCE_AGENT_ENABLED");
    expect(envExample).toContain("STOREAGENT_COMMERCE_AGENT_ORG_ALLOWLIST");
  });

  it("stays offline — no live provider SDKs in 1e surfaces", () => {
    const files = [
      "lib/commerce-agent/actions.ts",
      "lib/commerce-agent/merchant-investigation.ts",
      "lib/commerce-agent/merchant-response.ts",
      "lib/commerce-agent/authorized-l1-deps.ts",
      "lib/commerce-agent/intents.ts",
      "lib/commerce-agent/client-request.ts",
      "components/inventory/sku-commerce-agent-panel.tsx",
    ];
    const forbidden = [
      "openai",
      "@anthropic",
      "api.openai.com",
      "supportsLiveNetwork: true",
      'adapterId: "live_provider"',
    ];
    for (const file of files) {
      const source = read(file).toLowerCase();
      for (const fragment of forbidden) {
        expect(source).not.toContain(fragment.toLowerCase());
      }
    }
  });
});
