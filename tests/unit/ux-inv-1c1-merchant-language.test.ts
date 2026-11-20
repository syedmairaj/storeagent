import fs from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  incomingAttestationSaveNote,
  presentOrgIncomingEvidence,
  presentStoreIncomingAttestation,
} from "@/lib/incoming-evidence/incoming-evidence-presentation";
import type { TrustedIncomingEvidencePresence } from "@/lib/inventory-readiness/types";
import { buildSkuEvidence } from "@/lib/inventory-intelligence/sku-attention-presentation";
import type { MerchantInventoryIntelligenceRow } from "@/lib/inventory-intelligence/types";
import { REPLENISHMENT_FIELD_COPY } from "@/lib/planning-inputs/merchant-copy";
import { presentPlanningSaveFeedback } from "@/lib/planning-inputs/save-feedback";
import {
  buildReplenishmentImpactPresentation,
  formatCalculatedThresholdsValue,
} from "@/lib/planning-inputs/replenishment-impact-presentation";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function presence(
  overrides: Partial<TrustedIncomingEvidencePresence> = {},
): TrustedIncomingEvidencePresence {
  return {
    hasPurchaseOrderItemRows: false,
    evidenceCompleteStoreCount: 0,
    knownIncomingGrainCount: 0,
    knownZeroGrainCount: 0,
    positiveIncomingGrainCount: 0,
    ...overrides,
  };
}

function row(
  overrides: Partial<MerchantInventoryIntelligenceRow> & {
    grainKey: string;
    coverStatus: MerchantInventoryIntelligenceRow["coverStatus"];
  },
): MerchantInventoryIntelligenceRow {
  return {
    snapshotId: "s",
    organizationId: "o",
    storeId: "st",
    locationId: "l",
    variantId: "v",
    sku: overrides.sku ?? overrides.grainKey,
    productTitle: "Product",
    storeName: "snapstore",
    locationName: "Main",
    availableQuantity: 10,
    onHandQuantity: 10,
    observedAt: "2026-11-18T12:00:00.000Z",
    asOfMetricDate: "2026-11-20",
    metricDate: "2026-11-18",
    salesVelocity30d: 1,
    salesVelocity30dReasonCode: null,
    eligibleDays30d: 4,
    coverageRatio30d: null,
    daysOfStock: null,
    daysOfStockReasonCode: null,
    safetyStock: null,
    safetyStockReasonCode: null,
    reorderPoint: null,
    reorderPointReasonCode: null,
    targetStock: null,
    targetStockReasonCode: null,
    evidenceLabel: "x",
    ...overrides,
  };
}

describe("UX-INV-1c.1 merchant language & evidence clarity", () => {
  it("uses Clear value and merchant planning field labels", () => {
    expect(REPLENISHMENT_FIELD_COPY.leadTimeDays.label).toBe(
      "Supplier lead time (days)",
    );
    expect(REPLENISHMENT_FIELD_COPY.safetyStockDays.label).toBe(
      "Safety stock buffer (days)",
    );
    expect(REPLENISHMENT_FIELD_COPY.reviewPeriodDays.label).toBe(
      "Stock review frequency (days)",
    );
    expect(REPLENISHMENT_FIELD_COPY.leadTimeDays.hint).toMatch(
      /not a verified supplier fact/i,
    );
    expect(REPLENISHMENT_FIELD_COPY.leadTimeDays.hint).toMatch(
      /Blank stays blank/i,
    );

    const editor = read("components/inventory/planning-inputs-editor.tsx");
    expect(editor).toContain("Clear value");
    expect(editor).not.toContain("Clear to unknown");
    expect(editor).toContain("presentPlanningSaveFeedback");
    expect(editor).toContain("data-planning-save-headline");
  });

  it("preserves null vs zero in planning presentation", () => {
    const blank = buildReplenishmentImpactPresentation({
      leadTimeDays: null,
      safetyStockDays: null,
      reviewPeriodDays: null,
    });
    expect(blank.configurationKind).toBe("all_blank");
    expect(blank.supporting).toMatch(/Blank stays blank/i);

    const zero = buildReplenishmentImpactPresentation({
      leadTimeDays: 0,
      safetyStockDays: 0,
      reviewPeriodDays: 0,
    });
    expect(zero.configurationKind).toBe("complete");
    expect(zero.fieldExplainers[0]?.persistedLabel).toMatch(/known zero/i);

    const partial = buildReplenishmentImpactPresentation({
      leadTimeDays: 7,
      safetyStockDays: null,
      reviewPeriodDays: 7,
    });
    expect(partial.impactBridge).toMatch(/lead 7 · safety blank · review 7/);
  });

  it("consolidates save feedback without equating idle refresh to current metrics", () => {
    const refreshed = presentPlanningSaveFeedback({
      status: "ready",
      succeeded: 3,
      pendingRemaining: false,
      configurationKind: "complete",
    });
    expect(refreshed.headline).toBe("Settings saved");
    expect(refreshed.warning).toMatch(/refreshed for 3/i);

    const noRefresh = presentPlanningSaveFeedback({
      status: "ready",
      succeeded: 0,
      pendingRemaining: false,
      configurationKind: "complete",
    });
    expect(noRefresh.headline).toBe("Settings saved");
    expect(noRefresh.warning).toMatch(
      /does not mean inventory metrics are already current/i,
    );
    expect(noRefresh.note).not.toMatch(/thresholds refreshed/i);
  });

  it("labels historical thresholds with metric date without duplicate buy disclaimer in the value", () => {
    const stale = formatCalculatedThresholdsValue({
      safetyStock: 2,
      reorderPoint: 5,
      targetStock: 12,
      metricDate: "2026-11-18",
      historical: true,
    });
    expect(stale).toMatch(/Safety stock 2 · Reorder point 5 · Target stock 12/);
    expect(stale).toMatch(/metric 2026-11-18/);
    expect(stale).toMatch(/historical while cover is not current/);
    expect(stale).not.toMatch(/not buy quantities/i);

    const evidence = buildSkuEvidence(
      row({
        grainKey: "BAG",
        coverStatus: "stale",
        safetyStock: 2,
        safetyStockReasonCode: null,
        reorderPoint: 5,
        reorderPointReasonCode: null,
        targetStock: 12,
        targetStockReasonCode: null,
        metricDate: "2026-11-18",
        asOfMetricDate: "2026-11-20",
      }),
      { stockObservationsStale: true },
    );
    expect(evidence.facts.find((f) => f.id === "thresholds")?.label).toMatch(
      /Historical/,
    );
    expect(evidence.facts.find((f) => f.id === "provenance")?.value).toContain(
      "metric 2026-11-18",
    );
  });

  it("puts stock condition and next step before evidence in the inspector", () => {
    const inspector = read(
      "components/inventory/sku-intelligence-inspector.tsx",
    );
    const stockIdx = inspector.indexOf('data-inspector-section="stock"');
    const nextIdx = inspector.indexOf('data-inspector-section="next"');
    const factsIdx = inspector.indexOf('data-inspector-section="facts"');
    const thresholdsIdx = inspector.indexOf(
      'data-inspector-section="thresholds"',
    );
    const provenanceIdx = inspector.indexOf(
      'data-inspector-section="provenance"',
    );
    expect(stockIdx).toBeGreaterThan(-1);
    expect(nextIdx).toBeGreaterThan(stockIdx);
    expect(factsIdx).toBeGreaterThan(nextIdx);
    expect(thresholdsIdx).toBeGreaterThan(factsIdx);
    expect(provenanceIdx).toBeGreaterThan(thresholdsIdx);
    expect(inspector).not.toContain('data-inspector-section="interpretation"');
    expect(inspector).toContain("data-inspector-historical-notice");
  });

  it("explains store-level confirmation vs destination-scoped PO evidence", () => {
    const unknown = presentOrgIncomingEvidence(presence());
    expect(unknown.kind).toBe("unknown");
    expect(unknown.scopeNote).toMatch(/store-level confirmation/i);
    expect(unknown.scopeNote).toMatch(/destination-scoped/i);
    expect(unknown.statusDetail).toMatch(/never invented as zero/i);

    const pending = presentOrgIncomingEvidence(
      presence({
        evidenceCompleteStoreCount: 1,
        knownIncomingGrainCount: 0,
      }),
    );
    expect(pending.kind).toBe("incomplete");
    expect(pending.statusLabel).toMatch(/Waiting on metrics refresh/i);
    expect(pending.statusDetail).toMatch(/not the same as verified zero/i);

    const verified = presentOrgIncomingEvidence(
      presence({
        evidenceCompleteStoreCount: 1,
        knownIncomingGrainCount: 2,
        knownZeroGrainCount: 2,
      }),
    );
    expect(verified.kind).toBe("verified_zero");
    expect(verified.supporting).toMatch(/distinct from .no PO evidence/i);

    const store = presentStoreIncomingAttestation({
      storeId: "s1",
      storeName: "snapstore",
      evidenceComplete: false,
      updatedAt: null,
    });
    expect(store.toggleLabel).toMatch(/Confirm store PO evidence is complete/i);
    expect(store.toggleHint).toMatch(/destination-scoped/i);
    expect(store.toggleHint).not.toMatch(/creates PO/i);

    expect(incomingAttestationSaveNote(false)).toMatch(
      /stay incoming not confirmed/i,
    );
  });

  it("mocks uncheck → save → refresh restoring not-confirmed store state", async () => {
    type SaveArgs = {
      organizationId: string;
      storeId: string;
      evidenceComplete: boolean;
    };
    const save = vi.fn(async (input: SaveArgs) => {
      expect(input.evidenceComplete).toBe(false);
      return {
        ok: true as const,
        evidenceComplete: false,
        metricsRefresh: {
          status: "ready" as const,
          note: "Settings saved",
          pendingRemaining: false,
          succeeded: 0,
          stoppedReason: "drained",
        },
      };
    });

    const result = await save({
      organizationId: "org",
      storeId: "store",
      evidenceComplete: false,
    });
    expect(result.ok).toBe(true);
    expect(result.evidenceComplete).toBe(false);
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ evidenceComplete: false }),
    );
    expect(incomingAttestationSaveNote(result.evidenceComplete)).toMatch(
      /Store completeness cleared/i,
    );
    expect(incomingAttestationSaveNote(result.evidenceComplete)).toMatch(
      /not confirmed/i,
    );
  });

  it("keeps incoming helper architecture free of commercial unlock", () => {
    const helper = read(
      "lib/incoming-evidence/incoming-evidence-presentation.ts",
    );
    const editor = read("components/inventory/incoming-evidence-editor.tsx");
    expect(helper).toContain("store-level confirmation");
    expect(helper).toContain("destination-scoped");
    expect(helper).toContain("Waiting on metrics refresh");
    expect(editor).toContain("data-incoming-scope-note");
    expect(editor).toContain("setRows(initial)");
    expect(editor).toContain("prevInitial");
    expect(editor).not.toMatch(/useEffect\(\s*\(\)\s*=>\s*\{\s*setRows\(initial\)/);
    expect(helper).not.toMatch(/decideInventoryAction|auto-buy|place order/i);
  });
});
