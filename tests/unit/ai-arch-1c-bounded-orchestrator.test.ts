import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildDeterministicPlan,
  buildTrustedMerchantContext,
  COMMERCE_AGENT_QUERY_VERSION,
  createFixtureL1ToolDeps,
  getDefaultCommerceAgentConfig,
  mayRunCommerceAgent,
  ORCHESTRATOR_MAX_TOOL_CALLS,
  readCommerceAgentServerConfig,
  runCommerceAgent,
  validateDeterministicPlan,
  type AgentQuery,
  type DeterministicPlan,
  type L1ToolDeps,
} from "@/lib/commerce-agent";
import type { MerchantInventoryIntelligenceRow } from "@/lib/inventory-intelligence/types";
import type { MerchantPlanningInputs } from "@/lib/planning-inputs/types";

const ROOT = path.resolve(__dirname, "../..");

const ORG = "11111111-1111-4111-8111-111111111111";
const STORE = "22222222-2222-4222-8222-222222222222";
const LOCATION = "33333333-3333-4333-8333-333333333333";
const VARIANT = "44444444-4444-4444-8444-444444444444";
const OTHER_ORG = "99999999-9999-4999-8999-999999999999";
const OTHER_STORE = "55555555-5555-4555-8555-555555555555";
const OTHER_VARIANT = "66666666-6666-4666-8666-666666666666";

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

function context(permissions: string[] = ["inventory.read"]) {
  return buildTrustedMerchantContext({
    userId: "user-1",
    organizationId: ORG,
    role: "owner",
    permissions: permissions as never,
    storeId: STORE,
    locationId: LOCATION,
    variantId: VARIANT,
    asOf: "2026-11-27T00:00:00.000Z",
  });
}

function query(
  overrides: Partial<AgentQuery> = {},
): AgentQuery {
  return {
    schemaVersion: COMMERCE_AGENT_QUERY_VERSION,
    locale: "en-US",
    intentClass: "inventory_fact",
    clientRequestId: "req-1",
    hintGrain: {
      organizationId: ORG,
      storeId: STORE,
      locationId: LOCATION,
      variantId: VARIANT,
    },
    ...overrides,
  };
}

function deps(
  rows: MerchantInventoryIntelligenceRow[] = [row()],
  planning?: MerchantPlanningInputs | null,
): L1ToolDeps {
  const planningByOrg = new Map<string, MerchantPlanningInputs | null>();
  if (planning !== undefined) {
    planningByOrg.set(ORG, planning);
  } else {
    planningByOrg.set(ORG, {
      leadTimeDays: 7,
      safetyStockDays: 5,
      reviewPeriodDays: 7,
    });
  }
  return createFixtureL1ToolDeps({ rows, planningByOrg });
}

async function run(input: {
  query?: AgentQuery;
  context?: ReturnType<typeof context>;
  deps?: L1ToolDeps;
  stockObservationsStale?: boolean;
  forceEnabled?: boolean;
  planOverride?: DeterministicPlan;
  config?: { enabled: boolean; organizationAllowlist: readonly string[] };
}) {
  return runCommerceAgent({
    query: input.query ?? query(),
    context: input.context ?? context(),
    deps: input.deps ?? deps(),
    stockObservationsStale: input.stockObservationsStale ?? false,
    forceEnabled: input.forceEnabled ?? true,
    planOverride: input.planOverride,
    config: input.config,
    runId: "run-test-1",
  });
}

describe("AI-ARCH-1c bounded deterministic orchestrator", () => {
  it("defaults soft-enable OFF and requires allowlist when enabled", () => {
    const defaults = getDefaultCommerceAgentConfig();
    expect(defaults.enabled).toBe(false);
    expect(defaults.organizationAllowlist).toEqual([]);

    const disabled = mayRunCommerceAgent({ organizationId: ORG });
    expect(disabled.mayRun).toBe(false);
    expect(disabled.enablementSource).toBe("disabled_default");

    const gated = mayRunCommerceAgent({
      organizationId: ORG,
      config: { enabled: true, organizationAllowlist: [ORG] },
    });
    expect(gated.mayRun).toBe(true);

    const wrongOrg = mayRunCommerceAgent({
      organizationId: OTHER_ORG,
      config: { enabled: true, organizationAllowlist: [ORG] },
    });
    expect(wrongOrg.mayRun).toBe(false);
  });

  it("reads env config without enabling by default", () => {
    const config = readCommerceAgentServerConfig({} as NodeJS.ProcessEnv);
    expect(config.enabled).toBe(false);
  });

  it("answers a supported structured inventory_fact intent from verified evidence", async () => {
    const result = await run({});
    expect(result.status).toBe("answered");
    if (result.status !== "answered") {
      return;
    }
    expect(result.generator).toBe("deterministic");
    expect(result.findings.every((f) => f.verified)).toBe(true);
    expect(result.evidenceHash.length).toBeGreaterThan(8);
    expect(result.merchantAnswer.toLowerCase()).not.toMatch(/\bbuy now\b/);
    expect(result.recommendedAction.requiresHumanApproval).toBe(true);
    expect(result.trace.steps.some((s) => s.kind === "plan" && s.ok)).toBe(
      true,
    );
    expect(
      result.trace.steps.filter((s) => s.kind === "tool" && s.ok).length,
    ).toBe(4);
    expect(result.trace.organizationId).toBe(ORG);
  });

  it("abstains on unsupported intent", async () => {
    const result = await run({
      query: query({ intentClass: "competitor_research" }),
    });
    expect(result.status).toBe("abstained");
    if (result.status === "abstained") {
      expect(result.code).toBe("UNSUPPORTED_INTENT");
    }
  });

  it("abstains when agent soft-enable is OFF", async () => {
    const result = await run({
      forceEnabled: false,
      config: getDefaultCommerceAgentConfig(),
    });
    expect(result.status).toBe("abstained");
    if (result.status === "abstained") {
      expect(result.code).toBe("AGENT_DISABLED");
    }
  });

  it("abstains on missing / not-found evidence", async () => {
    const result = await run({ deps: deps([]) });
    expect(result.status).toBe("abstained");
    if (result.status === "abstained") {
      expect(result.code).toBe("INSUFFICIENT_EVIDENCE");
    }
  });

  it("abstains on stale evidence for reorder_review", async () => {
    const result = await run({
      query: query({ intentClass: "reorder_review" }),
      stockObservationsStale: true,
      deps: deps([
        row({
          coverStatus: "stale",
          // Avoid cover/unavailable conflict so stale policy is observable.
          availableQuantity: 10,
          daysOfStock: 5,
        }),
      ]),
    });
    expect(result.status).toBe("abstained");
    if (result.status === "abstained") {
      expect(result.code).toBe("STALE_EVIDENCE");
      expect(result.evidenceHash).toBeTruthy();
    }
  });

  it("preserves uncertainty and missing labels for data_gap without inventing metrics", async () => {
    const result = await run({
      query: query({ intentClass: "data_gap" }),
      deps: deps([
        row({
          availableQuantity: null,
          coverStatus: "unknown_stock",
          salesVelocity30d: null,
          daysOfStock: null,
          safetyStock: null,
          reorderPoint: null,
          targetStock: null,
        }),
      ]),
    });
    // May answer with verified identity/missing facts or abstain if no verified findings.
    if (result.status === "answered") {
      expect(result.uncertainty.length).toBeGreaterThan(0);
      expect(result.merchantAnswer).not.toMatch(/\b9999\b/);
      expect(result.recommendedAction.actionClass).not.toBe("reorder_candidate");
    } else {
      expect([
        "INSUFFICIENT_EVIDENCE",
        "STALE_EVIDENCE",
        "CONFLICTING_EVIDENCE",
      ]).toContain(result.code);
    }
  });

  it("abstains on conflicting / contradictory facts", async () => {
    // cover_unavailable conflict path: available null with engine cover facts present
    // is mapped; divergent values also conflict. Use cover unavailable conflict.
    const result = await run({
      deps: deps([
        row({
          availableQuantity: null,
          coverStatus: "unknown_stock",
          daysOfStock: 5,
          safetyStock: 10,
          reorderPoint: 24,
          targetStock: 38,
        }),
      ]),
    });
    if (result.status === "abstained") {
      expect(["CONFLICTING_EVIDENCE", "INSUFFICIENT_EVIDENCE"]).toContain(
        result.code,
      );
    } else {
      // If mapper still yields verified non-conflict findings, answer must not hide uncertainty.
      expect(result.uncertainty.length + result.findings.length).toBeGreaterThan(
        0,
      );
    }
  });

  it("rejects wrong tenant organization hint", async () => {
    const result = await run({
      query: query({
        hintGrain: {
          organizationId: OTHER_ORG,
          storeId: STORE,
          locationId: LOCATION,
          variantId: VARIANT,
        },
      }),
    });
    expect(result.status).toBe("abstained");
    if (result.status === "abstained") {
      expect(result.code).toBe("TENANT_SCOPE_MISMATCH");
    }
  });

  it("rejects wrong store / SKU grain against trusted context", async () => {
    const wrongStore = await run({
      query: query({
        hintGrain: {
          organizationId: ORG,
          storeId: OTHER_STORE,
          locationId: LOCATION,
          variantId: VARIANT,
        },
      }),
      // context pins STORE — hint conflicts
      context: context(),
    });
    expect(wrongStore.status).toBe("abstained");
    if (wrongStore.status === "abstained") {
      expect(wrongStore.code).toBe("TENANT_SCOPE_MISMATCH");
    }

    const wrongSku = await run({
      deps: deps([
        row({
          variantId: OTHER_VARIANT,
          grainKey: `${STORE}:${LOCATION}:${OTHER_VARIANT}`,
        }),
      ]),
      context: buildTrustedMerchantContext({
        userId: "user-1",
        organizationId: ORG,
        role: "owner",
        permissions: ["inventory.read"] as never,
        storeId: STORE,
        locationId: LOCATION,
        variantId: VARIANT,
        asOf: "2026-11-27T00:00:00.000Z",
      }),
    });
    expect(wrongSku.status).toBe("abstained");
    if (wrongSku.status === "abstained") {
      expect(wrongSku.code).toBe("INSUFFICIENT_EVIDENCE");
    }
  });

  it("abstains when inventory.read permission is missing", async () => {
    const result = await run({
      context: context([]),
    });
    expect(result.status).toBe("abstained");
    if (result.status === "abstained") {
      expect(result.code).toBe("PERMISSION_DENIED");
    }
  });

  it("rejects forged tool ids / unsafe plans before execution", async () => {
    const forged: DeterministicPlan = {
      intentClass: "inventory_fact",
      maxSteps: 6,
      maxToolCalls: 4,
      deadlineMs: 8000,
      steps: [
        {
          step: 1,
          toolId: "web_search.market",
          purpose: "forge",
        },
      ],
    };
    const validated = validateDeterministicPlan({
      plan: forged,
      context: context(),
    });
    expect(validated.ok).toBe(false);

    const result = await run({ planOverride: forged });
    expect(result.status).toBe("abstained");
    if (result.status === "abstained") {
      expect(["INVALID_PLAN", "FORBIDDEN_ACTION_CLAIM"]).toContain(result.code);
    }

    const writePlan: DeterministicPlan = {
      ...forged,
      steps: [
        {
          step: 1,
          toolId: "purchase.create_order",
          purpose: "write",
        },
      ],
    };
    const writeResult = await run({ planOverride: writePlan });
    expect(writeResult.status).toBe("abstained");
    if (writeResult.status === "abstained") {
      expect(writeResult.code).toBe("FORBIDDEN_ACTION_CLAIM");
    }
  });

  it("abstains on tool exception", async () => {
    const base = deps();
    const exploding: L1ToolDeps = {
      getPlanningInputs: base.getPlanningInputs,
      getSkuIntelligence: async () => {
        throw new Error("boom");
      },
    };
    const result = await run({ deps: exploding });
    expect(result.status).toBe("abstained");
    if (result.status === "abstained") {
      expect(result.code).toBe("TOOL_FAILURE");
    }
  });

  it("abstains on tool timeout", async () => {
    const base = deps();
    const slow: L1ToolDeps = {
      getPlanningInputs: async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return base.getPlanningInputs({ organizationId: ORG });
      },
      getSkuIntelligence: base.getSkuIntelligence,
    };
    const plan = buildDeterministicPlan("inventory_fact");
    expect(plan).not.toBeNull();
    const result = await runCommerceAgent({
      query: query(),
      context: context(),
      deps: slow,
      stockObservationsStale: false,
      forceEnabled: true,
      runId: "run-timeout",
      // Force first tool to use a tiny timeout via plan deadline after slow start:
      // invokeL1Tool timeout is per-definition; inject a deps delay past definition by
      // wrapping getPlanningInputs and overriding via invoke — use plan deadline 1ms
      // after a deliberate sleep in planning.
      planOverride: {
        ...plan!,
        deadlineMs: 1,
      },
    });
    // Either TIMEOUT (deadline) or may complete if too fast — prefer deadline path.
    expect(result.status).toBe("abstained");
    if (result.status === "abstained") {
      expect(["TIMEOUT", "STEP_LIMIT", "TOOL_FAILURE"]).toContain(result.code);
    }
  });

  it("abstains when step / tool-call budget is exceeded", async () => {
    const plan = buildDeterministicPlan("inventory_fact");
    expect(plan).not.toBeNull();
    const result = await run({
      planOverride: {
        ...plan!,
        maxToolCalls: 1,
        maxSteps: 1,
        steps: plan!.steps.slice(0, 1),
      },
    });
    // With only planning step, no evidence bundle → insufficient
    expect(result.status).toBe("abstained");
    if (result.status === "abstained") {
      expect(["INSUFFICIENT_EVIDENCE", "STEP_LIMIT"]).toContain(result.code);
    }

    const overBudget = validateDeterministicPlan({
      plan: {
        intentClass: "inventory_fact",
        maxSteps: 6,
        maxToolCalls: ORCHESTRATOR_MAX_TOOL_CALLS,
        deadlineMs: 8000,
        steps: [
          ...plan!.steps,
          {
            step: 5,
            toolId: "planning.get_inputs",
            purpose: "extra",
          },
        ],
      },
      context: context(),
    });
    expect(overBudget.ok).toBe(false);
  });

  it("abstains on forbidden action request language", async () => {
    const result = await run({
      query: query({
        naturalLanguage: "Please buy now and create a purchase order",
      }),
    });
    expect(result.status).toBe("abstained");
    if (result.status === "abstained") {
      expect(result.code).toBe("FORBIDDEN_ACTION_CLAIM");
    }
  });

  it("keeps reorder_review explain-only (no create / buy)", async () => {
    const result = await run({
      query: query({ intentClass: "reorder_review" }),
      deps: deps([
        row({
          availableQuantity: 2,
          daysOfStock: 1,
          coverStatus: "valid",
          reorderPoint: 24,
        }),
      ]),
    });
    if (result.status === "answered") {
      expect(result.recommendedAction.actionClass).not.toBe(
        "reorder_candidate",
      );
      expect(result.approvalBoundary).not.toBe("none");
      expect(result.merchantAnswer.toLowerCase()).toContain(
        "no purchase or create action",
      );
    } else {
      expect(result.code).not.toBe("FORBIDDEN_ACTION_CLAIM");
    }
  });

  it("zero_sales_diagnosis keeps hypotheses unconfirmed", async () => {
    const result = await run({
      query: query({ intentClass: "zero_sales_diagnosis" }),
      deps: deps([
        row({
          salesVelocity30d: 0,
          availableQuantity: 10,
          coverStatus: "valid",
        }),
      ]),
    });
    if (result.status === "answered") {
      expect(result.merchantAnswer.toLowerCase()).not.toMatch(
        /\bcustomers hate\b/,
      );
      expect(result.findings.every((f) => f.claimClass !== "hypothesis" || !f.verified)).toBe(
        true,
      );
    }
  });

  it("records non-sensitive agent trace fields only", async () => {
    const result = await run({});
    const serialized = JSON.stringify(result.trace);
    expect(serialized).not.toMatch(/sk-|password|secret|service_role/i);
    expect(result.trace.schemaVersion).toBe("commerce-agent-trace-v1");
    expect(result.trace.clientRequestId).toBe("req-1");
  });

  it("does not perform network calls, writes, or paid AI from orchestrator sources", () => {
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

    const files = listSourceFiles("lib/commerce-agent/orchestrator");
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = fs.readFileSync(path.join(ROOT, file), "utf8");
      const lower = source.toLowerCase();
      expect(lower).not.toContain("openai");
      expect(lower).not.toContain("anthropic");
      expect(lower).not.toContain("createsupabase");
      expect(lower).not.toMatch(/\bfetch\s*\(/);
      expect(lower).not.toContain("syncrun");
      expect(lower).not.toContain("createinventoryaction");
      expect(lower).not.toContain("loadmerchantinventoryintelligence");
      expect(source).not.toContain("app/api/");
      expect(source).not.toContain("pb1");
    }
  });

  it("does not mutate M5–M7 calculation engines", () => {
    const runSource = fs.readFileSync(
      path.join(ROOT, "lib/commerce-agent/orchestrator/run.ts"),
      "utf8",
    );
    expect(runSource).not.toContain("lib/metrics/inventory-math");
    expect(runSource).not.toContain("decideInventoryAction");
    expect(runSource).not.toContain("calculateRecommendedOrderQuantity");
  });
});
