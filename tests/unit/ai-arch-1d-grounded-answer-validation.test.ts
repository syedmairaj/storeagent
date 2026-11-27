import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  applyValidatedCommerceAgentDraft,
  assembleFromEvidenceBundle,
  buildTrustedMerchantContext,
  COMMERCE_AGENT_DRAFT_VERSION,
  COMMERCE_AGENT_PROMPT_VERSION,
  COMMERCE_AGENT_QUERY_VERSION,
  COMMERCE_AGENT_TRACE_VERSION,
  createCommerceAgentOfflineStubAdapter,
  createFixtureL1ToolDeps,
  polishCommerceAgentAnswer,
  runCommerceAgent,
  validateCommerceAgentAnswerDraft,
  type AgentAnswer,
  type AgentQuery,
  type CommerceAgentAnswerDraft,
  type CommerceAgentDraftAdapter,
  type L1ToolDeps,
} from "@/lib/commerce-agent";
import type { MerchantInventoryIntelligenceRow } from "@/lib/inventory-intelligence/types";
import type { MerchantPlanningInputs } from "@/lib/planning-inputs/types";

const ROOT = path.resolve(__dirname, "../..");

const ORG = "11111111-1111-4111-8111-111111111111";
const STORE = "22222222-2222-4222-8222-222222222222";
const LOCATION = "33333333-3333-4333-8333-333333333333";
const VARIANT = "44444444-4444-4444-8444-444444444444";

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

function context() {
  return buildTrustedMerchantContext({
    userId: "user-1",
    organizationId: ORG,
    role: "owner",
    permissions: ["inventory.read"] as never,
    storeId: STORE,
    locationId: LOCATION,
    variantId: VARIANT,
    asOf: "2026-11-27T00:00:00.000Z",
  });
}

function query(): AgentQuery {
  return {
    schemaVersion: COMMERCE_AGENT_QUERY_VERSION,
    locale: "en-US",
    intentClass: "inventory_fact",
    clientRequestId: "req-1d",
    hintGrain: {
      organizationId: ORG,
      storeId: STORE,
      locationId: LOCATION,
      variantId: VARIANT,
    },
  };
}

function deps(
  rows: MerchantInventoryIntelligenceRow[] = [row()],
): L1ToolDeps {
  const planningByOrg = new Map<string, MerchantPlanningInputs | null>();
  planningByOrg.set(ORG, {
    leadTimeDays: 7,
    safetyStockDays: 5,
    reviewPeriodDays: 7,
  });
  return createFixtureL1ToolDeps({ rows, planningByOrg });
}

async function deterministicAnswer(): Promise<{
  answer: AgentAnswer;
  bundle: import("@/lib/commerce-agent").CommerceAgentEvidenceBundle;
}> {
  const { invokeL1Tool } = await import("@/lib/commerce-agent");
  const toolDeps = deps();
  const ctx = context();
  const planning = await invokeL1Tool({
    toolId: "planning.get_inputs",
    context: ctx,
    deps: toolDeps,
    input: { organizationId: ORG },
  });
  expect(planning.ok).toBe(true);
  const sku = await invokeL1Tool({
    toolId: "inventory.get_sku_intelligence",
    context: ctx,
    deps: toolDeps,
    input: { storeId: STORE, locationId: LOCATION, variantId: VARIANT },
  });
  expect(sku.ok).toBe(true);
  if (!sku.ok || !planning.ok) {
    throw new Error("fixture tools failed");
  }
  const built = await invokeL1Tool({
    toolId: "inventory.build_explainer_evidence",
    context: ctx,
    deps: toolDeps,
    input: {
      row: (sku.output as { row: MerchantInventoryIntelligenceRow }).row,
      stockObservationsStale: false,
      planning: (planning.output as { planning: MerchantPlanningInputs | null })
        .planning,
      incomingTrust: "unknown",
    },
  });
  expect(built.ok).toBe(true);
  if (!built.ok) {
    throw new Error("build evidence failed");
  }
  const bundle = (
    built.output as {
      bundle: import("@/lib/commerce-agent").CommerceAgentEvidenceBundle;
    }
  ).bundle;

  const assembled = assembleFromEvidenceBundle({
    intentClass: "inventory_fact",
    bundle,
    trace: {
      schemaVersion: COMMERCE_AGENT_TRACE_VERSION,
      runId: "run-1d-base",
      clientRequestId: "req-1d",
      organizationId: ORG,
      startedAt: "2026-11-27T00:00:00.000Z",
      steps: [],
    },
  });
  expect(assembled.status).toBe("answered");
  return {
    answer: assembled as AgentAnswer,
    bundle,
  };
}

function echoDraft(
  baseline: AgentAnswer,
  bundle: import("@/lib/commerce-agent").CommerceAgentEvidenceBundle,
  overrides: Partial<CommerceAgentAnswerDraft> = {},
): CommerceAgentAnswerDraft {
  return {
    schemaVersion: COMMERCE_AGENT_DRAFT_VERSION,
    adapterId: "offline_stub",
    provider: "offline_stub",
    model: "commerce-agent-stub-v1",
    promptVersion: COMMERCE_AGENT_PROMPT_VERSION,
    evidenceHash: bundle.evidenceHash,
    merchantAnswer: baseline.merchantAnswer,
    citedEvidenceIds: bundle.evidence.slice(0, 3).map((e) => e.evidenceId),
    citedClaimIds: baseline.findings.slice(0, 3).map((c) => c.claimId),
    suggestedNextStepCodes: baseline.nextSteps.map((s) => s.code),
    ...overrides,
  };
}

describe("AI-ARCH-1d grounded answer validation", () => {
  it("accepts a valid evidence-grounded draft", async () => {
    const { answer, bundle } = await deterministicAnswer();
    const draft = echoDraft(answer, bundle);
    const validation = validateCommerceAgentAnswerDraft({
      draft,
      bundle,
      context: context(),
      baseline: answer,
    });
    expect(validation.ok).toBe(true);

    const applied = applyValidatedCommerceAgentDraft({
      draft,
      bundle,
      context: context(),
      baseline: answer,
    });
    expect(applied.status).toBe("accepted");
    if (applied.status === "accepted") {
      expect(applied.answer.generator).toBe("ai_validated");
      expect(applied.answer.findings).toEqual(answer.findings);
      expect(applied.answer.evidenceHash).toBe(answer.evidenceHash);
    }
  });

  it("rejects hallucinated numeric values and falls back", async () => {
    const { answer, bundle } = await deterministicAnswer();
    const polished = await polishCommerceAgentAnswer({
      baseline: answer,
      bundle,
      context: context(),
      adapter: createCommerceAgentOfflineStubAdapter({
        behavior: { mode: "hallucinate_number" },
      }),
    });
    expect(polished.status).toBe("answered");
    if (polished.status === "answered") {
      expect(polished.answer.generator).toBe("fallback_deterministic");
      expect(polished.answer.merchantAnswer).toBe(answer.merchantAnswer);
      expect(polished.answer.merchantAnswer).not.toContain("999");
    }
  });

  it("rejects wrong units / product SKU scope", async () => {
    const { answer, bundle } = await deterministicAnswer();

    const unit = await polishCommerceAgentAnswer({
      baseline: answer,
      bundle,
      context: context(),
      adapter: createCommerceAgentOfflineStubAdapter({
        behavior: { mode: "wrong_unit" },
      }),
    });
    expect(unit.status).toBe("answered");
    if (unit.status === "answered") {
      expect(unit.answer.generator).toBe("fallback_deterministic");
    }

    const sku = await polishCommerceAgentAnswer({
      baseline: answer,
      bundle,
      context: context(),
      adapter: createCommerceAgentOfflineStubAdapter({
        behavior: { mode: "wrong_sku" },
      }),
    });
    expect(sku.status).toBe("answered");
    if (sku.status === "answered") {
      expect(sku.answer.generator).toBe("fallback_deterministic");
    }
  });

  it("rejects fake citations / invented sources", async () => {
    const { answer, bundle } = await deterministicAnswer();
    const polished = await polishCommerceAgentAnswer({
      baseline: answer,
      bundle,
      context: context(),
      adapter: createCommerceAgentOfflineStubAdapter({
        behavior: { mode: "fake_citation" },
      }),
    });
    expect(polished.status).toBe("answered");
    if (polished.status === "answered") {
      expect(polished.answer.generator).toBe("fallback_deterministic");
    }
  });

  it("rejects estimate promoted to fact", async () => {
    const { answer, bundle } = await deterministicAnswer();
    const polished = await polishCommerceAgentAnswer({
      baseline: answer,
      bundle,
      context: context(),
      adapter: createCommerceAgentOfflineStubAdapter({
        behavior: { mode: "promote_estimate" },
      }),
    });
    expect(polished.status).toBe("answered");
    if (polished.status === "answered") {
      expect(polished.answer.generator).toBe("fallback_deterministic");
    }
  });

  it("rejects hypothesis presented as proven", async () => {
    const { answer, bundle } = await deterministicAnswer();
    const polished = await polishCommerceAgentAnswer({
      baseline: answer,
      bundle,
      context: context(),
      adapter: createCommerceAgentOfflineStubAdapter({
        behavior: { mode: "hypothesis_as_proven" },
      }),
    });
    expect(polished.status).toBe("answered");
    if (polished.status === "answered") {
      expect(polished.answer.generator).toBe("fallback_deterministic");
    }
  });

  it("rejects evidence-hash mismatch", async () => {
    const { answer, bundle } = await deterministicAnswer();
    const polished = await polishCommerceAgentAnswer({
      baseline: answer,
      bundle,
      context: context(),
      adapter: createCommerceAgentOfflineStubAdapter({
        behavior: { mode: "hash_mismatch" },
      }),
    });
    expect(polished.status).toBe("answered");
    if (polished.status === "answered") {
      expect(polished.answer.generator).toBe("fallback_deterministic");
    }
  });

  it("rejects forbidden purchase / advertising actions", async () => {
    const { answer, bundle } = await deterministicAnswer();
    const polished = await polishCommerceAgentAnswer({
      baseline: answer,
      bundle,
      context: context(),
      adapter: createCommerceAgentOfflineStubAdapter({
        behavior: { mode: "forbidden_action" },
      }),
    });
    expect(polished.status).toBe("answered");
    if (polished.status === "answered") {
      expect(polished.answer.generator).toBe("fallback_deterministic");
      expect(polished.answer.merchantAnswer.toLowerCase()).not.toContain(
        "buy now",
      );
    }
  });

  it("rejects prompt-injection attempts", async () => {
    const { answer, bundle } = await deterministicAnswer();
    const polished = await polishCommerceAgentAnswer({
      baseline: answer,
      bundle,
      context: context(),
      adapter: createCommerceAgentOfflineStubAdapter({
        behavior: { mode: "prompt_injection" },
      }),
    });
    expect(polished.status).toBe("answered");
    if (polished.status === "answered") {
      expect(polished.answer.generator).toBe("fallback_deterministic");
    }
  });

  it("rejects malformed and oversized output", async () => {
    const { answer, bundle } = await deterministicAnswer();
    const malformed = await polishCommerceAgentAnswer({
      baseline: answer,
      bundle,
      context: context(),
      adapter: createCommerceAgentOfflineStubAdapter({
        behavior: { mode: "malformed" },
      }),
    });
    expect(malformed.status).toBe("answered");
    if (malformed.status === "answered") {
      expect(malformed.answer.generator).toBe("fallback_deterministic");
    }

    const oversized = await polishCommerceAgentAnswer({
      baseline: answer,
      bundle,
      context: context(),
      adapter: createCommerceAgentOfflineStubAdapter({
        behavior: { mode: "oversized" },
      }),
    });
    expect(oversized.status).toBe("answered");
    if (oversized.status === "answered") {
      expect(oversized.answer.generator).toBe("fallback_deterministic");
    }
  });

  it("falls back safely on stub timeout / error", async () => {
    const { answer, bundle } = await deterministicAnswer();

    const timedOut = await polishCommerceAgentAnswer({
      baseline: answer,
      bundle,
      context: context(),
      adapter: createCommerceAgentOfflineStubAdapter({
        behavior: { mode: "hang_until_abort" },
      }),
      timeoutMs: 30,
    });
    expect(timedOut.status).toBe("answered");
    if (timedOut.status === "answered") {
      expect(timedOut.answer.generator).toBe("fallback_deterministic");
      expect(timedOut.answer.merchantAnswer).toBe(answer.merchantAnswer);
    }

    const errored = await polishCommerceAgentAnswer({
      baseline: answer,
      bundle,
      context: context(),
      adapter: createCommerceAgentOfflineStubAdapter({
        behavior: { mode: "error", reason: "AI_UNAVAILABLE" },
      }),
    });
    expect(errored.status).toBe("answered");
    if (errored.status === "answered") {
      expect(errored.answer.generator).toBe("fallback_deterministic");
    }
  });

  it("rejects live_provider adapters closed", async () => {
    const { answer, bundle } = await deterministicAnswer();
    const live: CommerceAgentDraftAdapter = {
      adapterId: "live_provider",
      supportsLiveNetwork: true,
      async generate() {
        throw new Error("must not be called");
      },
    };
    const polished = await polishCommerceAgentAnswer({
      baseline: answer,
      bundle,
      context: context(),
      adapter: live,
    });
    expect(polished.status).toBe("answered");
    if (polished.status === "answered") {
      expect(polished.answer.generator).toBe("fallback_deterministic");
    }
  });

  it("optional orchestrator polish accepts echo stub without changing facts", async () => {
    const result = await runCommerceAgent({
      query: query(),
      context: context(),
      deps: deps(),
      stockObservationsStale: false,
      forceEnabled: true,
      draftAdapter: createCommerceAgentOfflineStubAdapter({
        behavior: { mode: "echo_deterministic" },
      }),
      runId: "run-1d-polish",
    });
    expect(result.status).toBe("answered");
    if (result.status === "answered") {
      expect(result.generator).toBe("ai_validated");
      expect(result.findings.every((f) => f.verified)).toBe(true);
    }
  });

  it("default orchestrator path stays deterministic when no adapter", async () => {
    const result = await runCommerceAgent({
      query: query(),
      context: context(),
      deps: deps(),
      stockObservationsStale: false,
      forceEnabled: true,
      runId: "run-1d-default",
    });
    expect(result.status).toBe("answered");
    if (result.status === "answered") {
      expect(result.generator).toBe("deterministic");
    }
  });

  it("keeps validation / stub offline — no network, writes, or paid AI", () => {
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

    const files = listSourceFiles("lib/commerce-agent/validation");
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
      expect(source).not.toContain("supportsLiveNetwork: true");
      expect(source).not.toContain("openai.com");
      expect(source).not.toContain("api.anthropic.com");
    }
  });
});
