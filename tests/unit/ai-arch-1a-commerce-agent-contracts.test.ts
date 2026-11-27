import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildTrustedMerchantContext,
  mapInventoryExplainerEvidence,
  queryAttemptsTenantOverride,
  recommendationHasEvidenceAuthority,
  resolveAuthoritativeOrganizationId,
  COMMERCE_AGENT_CONTEXT_VERSION,
  COMMERCE_AGENT_EVIDENCE_BUNDLE_VERSION,
  COMMERCE_AGENT_QUERY_VERSION,
  type AgentQuery,
} from "@/lib/commerce-agent";
import { buildInventoryExplainerEvidence } from "@/lib/inventory-explainer/build-evidence";
import {
  INVENTORY_EXPLAINER_EVIDENCE_VERSION,
  type InventoryExplainerEvidence as InvEvidence,
} from "@/lib/inventory-explainer/types";
import type { MerchantInventoryIntelligenceRow } from "@/lib/inventory-intelligence/types";

const ORG = "11111111-1111-4111-8111-111111111111";
const STORE = "22222222-2222-4222-8222-222222222222";
const LOCATION = "33333333-3333-4333-8333-333333333333";
const VARIANT = "44444444-4444-4444-8444-444444444444";
const OTHER_ORG = "99999999-9999-4999-8999-999999999999";

function row(
  overrides: Partial<MerchantInventoryIntelligenceRow> & {
    grainKey: string;
    coverStatus: MerchantInventoryIntelligenceRow["coverStatus"];
  },
): MerchantInventoryIntelligenceRow {
  return {
    snapshotId: "snap-1",
    organizationId: ORG,
    storeId: STORE,
    locationId: LOCATION,
    variantId: VARIANT,
    sku: overrides.sku ?? "SKU-1",
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
    evidenceLabel: "valid cover",
    ...overrides,
  };
}

function evidenceFor(
  overrides: Partial<MerchantInventoryIntelligenceRow> & {
    grainKey: string;
    coverStatus: MerchantInventoryIntelligenceRow["coverStatus"];
  },
  opts?: {
    stockObservationsStale?: boolean;
    incomingTrust?: "unknown" | "attested_complete" | "trusted_po_presence";
  },
): InvEvidence {
  const r = row(overrides);
  return buildInventoryExplainerEvidence({
    row: r,
    organizationId: r.organizationId,
    stockObservationsStale: opts?.stockObservationsStale ?? false,
    planning: {
      leadTimeDays: 7,
      safetyStockDays: 5,
      reviewPeriodDays: 7,
    },
    incomingTrust: opts?.incomingTrust ?? "unknown",
  });
}

function trustedContext(overrides?: { organizationId?: string; storeId?: string }) {
  return buildTrustedMerchantContext({
    userId: "user-1",
    organizationId: overrides?.organizationId ?? ORG,
    role: "owner",
    permissions: ["inventory.read", "stores.read"],
    storeId: overrides?.storeId,
    asOf: "2026-11-27T00:00:00.000Z",
  });
}

describe("AI-ARCH-1a commerce agent contracts", () => {
  it("builds trusted MerchantContext that ignores query org hints", () => {
    const context = trustedContext();
    expect(context.schemaVersion).toBe(COMMERCE_AGENT_CONTEXT_VERSION);
    expect(context.organizationId).toBe(ORG);

    const query: AgentQuery = {
      schemaVersion: COMMERCE_AGENT_QUERY_VERSION,
      locale: "en-US",
      intentClass: "inventory_fact",
      clientRequestId: "req-1",
      hintGrain: { organizationId: OTHER_ORG, storeId: STORE },
    };

    expect(queryAttemptsTenantOverride(context, query)).toBe(true);
    expect(resolveAuthoritativeOrganizationId(context)).toBe(ORG);
    expect(query.hintGrain?.organizationId).toBe(OTHER_ORG);
  });

  it("maps valid AI-INV evidence into observed + calculation records", () => {
    const evidence = evidenceFor({
      grainKey: "st:l:v",
      coverStatus: "valid",
      daysOfStock: 5,
      availableQuantity: 10,
    });
    const result = mapInventoryExplainerEvidence({
      evidence,
      context: trustedContext(),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.bundle.schemaVersion).toBe(
      COMMERCE_AGENT_EVIDENCE_BUNDLE_VERSION,
    );
    expect(result.bundle.evidenceHash).toBe(evidence.evidenceHash);
    expect(result.bundle.organizationId).toBe(ORG);
    expect(result.bundle.sku).toBe("SKU-1");
    expect(result.bundle.freshnessClass).toBe("current");

    const available = result.bundle.evidence.find(
      (e) => e.inventoryFactId === "available",
    );
    expect(available?.claimClass).toBe("observed_fact");
    expect(available?.value).toContain("10");
    expect(available?.observedAt ?? available?.asOf).toBe(
      "2026-11-18T12:00:00.000Z",
    );
    expect(available?.sourceSystem).toBe("inventory_observation");

    const cover = result.bundle.calculations.find(
      (e) => e.inventoryFactId === "cover",
    );
    expect(cover?.claimClass).toBe("engine_calculation");
    expect(cover?.sourceSystem).toBe("sku_daily_metrics");

    const ss = result.bundle.calculations.find(
      (e) => e.inventoryFactId === "safety_stock",
    );
    expect(ss?.value).toBe("10");

    expect(result.bundle.recommendedAction.requiresHumanApproval).toBe(true);
    expect(
      recommendationHasEvidenceAuthority(
        result.bundle.recommendedAction,
        result.bundle,
      ),
    ).toBe(true);

    // next_step is guidance, not a fact record
    expect(
      result.bundle.evidence.some((e) => e.inventoryFactId === "next_step"),
    ).toBe(false);
  });

  it("preserves missing/partial evidence without inventing numbers", () => {
    const evidence = evidenceFor({
      grainKey: "st:l:v-missing",
      coverStatus: "short_history",
      daysOfStock: null,
      daysOfStockReasonCode: "insufficient_history",
      salesVelocity30d: null,
      salesVelocity30dReasonCode: "insufficient_history",
      eligibleDays30d: 2,
      safetyStock: null,
      safetyStockReasonCode: "planning_incomplete",
      reorderPoint: null,
      reorderPointReasonCode: "planning_incomplete",
      targetStock: null,
      targetStockReasonCode: "planning_incomplete",
    });

    const result = mapInventoryExplainerEvidence({
      evidence,
      context: trustedContext(),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.bundle.missingLabels.length).toBeGreaterThan(0);
    expect(
      result.bundle.evidence.some((e) => e.claimClass === "unknown"),
    ).toBe(true);

    // No fabricated cover-days calculation when cover is unavailable
    expect(
      result.bundle.calculations.some(
        (c) => c.inventoryFactId === "cover" && c.value === "0",
      ),
    ).toBe(false);

    // Thresholds with reason codes were unknown — mapper must not invent SS/ROP/target
    expect(
      result.bundle.calculations.some((c) => c.inventoryFactId === "safety_stock"),
    ).toBe(false);
    expect(
      result.bundle.calculations.some((c) => c.inventoryFactId === "reorder_point"),
    ).toBe(false);
    expect(
      result.bundle.calculations.some((c) => c.inventoryFactId === "target_stock"),
    ).toBe(false);
  });

  it("marks stale timestamps in freshness and uncertainty", () => {
    const evidence = evidenceFor(
      {
        grainKey: "st:l:v-stale",
        coverStatus: "valid",
      },
      { stockObservationsStale: true },
    );

    const result = mapInventoryExplainerEvidence({
      evidence,
      context: trustedContext(),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.bundle.freshnessClass).toBe("stale");
    expect(
      result.bundle.uncertainty.some((u) => /stale/i.test(u)),
    ).toBe(true);
    expect(
      result.bundle.evidence.every((e) => e.freshnessClass === "stale"),
    ).toBe(true);
  });

  it("records conflicting evidence and unverifies conflicting claims", () => {
    const base = evidenceFor({
      grainKey: "st:l:v-conflict",
      coverStatus: "short_history",
      daysOfStock: null,
      daysOfStockReasonCode: "insufficient_history",
    });

    // Handcraft adversarial divergent facts (mapper must not invent; must detect).
    const adversarial: InvEvidence = {
      ...base,
      coverAvailability: "unavailable",
      facts: [
        ...base.facts.filter((f) => f.id !== "cover"),
        {
          id: "cover",
          label: "Cover days",
          value: "99",
          source: "adversarial",
          asOf: "2026-11-18",
        },
        {
          id: "cover",
          label: "Cover days",
          value: "12",
          source: "adversarial-alt",
          asOf: "2026-11-18",
        },
      ],
    };

    const result = mapInventoryExplainerEvidence({
      evidence: adversarial,
      context: trustedContext(),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.bundle.conflicts.length).toBeGreaterThan(0);
    const coverClaims = result.bundle.findings.filter((f) =>
      f.text.includes("Cover"),
    );
    expect(coverClaims.some((c) => c.verified === false)).toBe(true);
    expect(
      result.bundle.uncertainty.some((u) => /conflict|divergent|unavailable/i.test(u)),
    ).toBe(true);
  });

  it("keeps untested hypotheses unverified and separate from observed facts", () => {
    const evidence = evidenceFor({
      grainKey: "st:l:v-zero",
      coverStatus: "valid",
      availableQuantity: 40,
      salesVelocity30d: 0,
      daysOfStock: 999,
    });

    const result = mapInventoryExplainerEvidence({
      evidence,
      context: trustedContext(),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.bundle.hypotheses.length).toBeGreaterThan(0);
    for (const h of result.bundle.hypotheses) {
      expect(h.claimClass).toBe("hypothesis");
      expect(h.verified).toBe(false);
      expect(h.evidenceIds).toEqual([]);
    }
    expect(
      result.bundle.evidence.every((e) => e.claimClass !== "hypothesis"),
    ).toBe(true);
  });

  it("rejects tenant context override / mismatch", () => {
    const evidence = evidenceFor({
      grainKey: "st:l:v",
      coverStatus: "valid",
    });

    const mismatch = mapInventoryExplainerEvidence({
      evidence,
      context: trustedContext({ organizationId: OTHER_ORG }),
    });
    expect(mismatch.ok).toBe(false);
    if (mismatch.ok) {
      return;
    }
    expect(mismatch.code).toBe("TENANT_SCOPE_MISMATCH");

    const storeMismatch = mapInventoryExplainerEvidence({
      evidence,
      context: trustedContext({
        storeId: "55555555-5555-4555-8555-555555555555",
      }),
    });
    expect(storeMismatch.ok).toBe(false);
    if (!storeMismatch.ok) {
      expect(storeMismatch.code).toBe("TENANT_SCOPE_MISMATCH");
    }
  });

  it("rejects unsupported evidence schemas and malformed hashes", () => {
    const evidence = evidenceFor({
      grainKey: "st:l:v",
      coverStatus: "valid",
    });

    const badSchema = mapInventoryExplainerEvidence({
      evidence: {
        ...evidence,
        schemaVersion: "not-a-real-schema" as typeof INVENTORY_EXPLAINER_EVIDENCE_VERSION,
      },
      context: trustedContext(),
    });
    expect(badSchema.ok).toBe(false);
    if (!badSchema.ok) {
      expect(badSchema.code).toBe("UNSUPPORTED_EVIDENCE");
    }

    const badHash = mapInventoryExplainerEvidence({
      evidence: { ...evidence, evidenceHash: "not-sha" },
      context: trustedContext(),
    });
    expect(badHash.ok).toBe(false);
    if (!badHash.ok) {
      expect(badHash.code).toBe("UNSUPPORTED_EVIDENCE");
    }
  });

  it("rejects recommendations that are not bound to mapped evidence hash", () => {
    const evidence = evidenceFor({
      grainKey: "st:l:v",
      coverStatus: "valid",
    });
    const result = mapInventoryExplainerEvidence({
      evidence,
      context: trustedContext(),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(
      recommendationHasEvidenceAuthority(
        {
          ...result.bundle.recommendedAction,
          inputsHash: "sha256:deadbeef",
        },
        result.bundle,
      ),
    ).toBe(false);

    expect(
      recommendationHasEvidenceAuthority(
        {
          recommendationId: "forged",
          actionClass: "reorder_candidate",
          summary: "Buy 500 from model text",
          requiresHumanApproval: true,
          approvalBoundary: "none",
          inputsHash: result.bundle.evidenceHash,
        },
        result.bundle,
      ),
    ).toBe(false);
  });
});

describe("AI-ARCH-1a architecture fences", () => {
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

  it("keeps commerce-agent offline — no live providers, fetch, or orchestrator", () => {
    const files = listSourceFiles("lib/commerce-agent");
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = read(file).toLowerCase();
      expect(source).not.toContain("openai");
      expect(source).not.toContain("anthropic");
      expect(source).not.toContain("generativelanguage");
      expect(source).not.toContain("supportsLiveNetwork: true".toLowerCase());
      expect(source).not.toContain('adapterid: "live_provider"');
      expect(source).not.toMatch(/\bfetch\s*\(/);
      expect(source).not.toContain("createinventoryaction");
      expect(source).not.toContain("syncrun");
    }
  });

  it("does not mutate M5–M7 calculation engine modules", () => {
    // Architectural: mapping imports AI-INV types/builders only, not inventory-math.
    const mapSource = read(
      "lib/commerce-agent/map-inventory-explainer-evidence.ts",
    );
    expect(mapSource).not.toContain("lib/metrics/inventory-math");
    expect(mapSource).not.toContain("decideInventoryAction");
    expect(mapSource).not.toContain("calculateRecommendedOrderQuantity");
  });
});
