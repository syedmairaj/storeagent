import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  incomingAttestationSaveNote,
  presentOrgIncomingEvidence,
  presentStoreIncomingAttestation,
} from "@/lib/incoming-evidence/incoming-evidence-presentation";
import type { TrustedIncomingEvidencePresence } from "@/lib/inventory-readiness/types";
import { buildSkuEvidence } from "@/lib/inventory-intelligence/sku-attention-presentation";
import type { MerchantInventoryIntelligenceRow } from "@/lib/inventory-intelligence/types";
import {
  buildReplenishmentImpactPresentation,
  formatCalculatedThresholdsValue,
  formatPlanningAssumptionsForInspector,
} from "@/lib/planning-inputs/replenishment-impact-presentation";
import type { MerchantPlanningInputs } from "@/lib/planning-inputs/types";

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

describe("UX-INV-1c replenishment impact presentation", () => {
  it("classifies blank, partial, and complete planning without inventing defaults", () => {
    const blank = buildReplenishmentImpactPresentation({
      leadTimeDays: null,
      safetyStockDays: null,
      reviewPeriodDays: null,
    });
    expect(blank.configurationKind).toBe("all_blank");
    expect(blank.impactBridge).toMatch(/No planning days are saved/i);
    expect(blank.commercialFence).toMatch(/unauthorized/i);
    expect(blank.eyebrow).toMatch(/Your replenishment assumptions/i);

    const partial = buildReplenishmentImpactPresentation({
      leadTimeDays: 7,
      safetyStockDays: null,
      reviewPeriodDays: 7,
    });
    expect(partial.configurationKind).toBe("partial");
    expect(partial.impactBridge).toMatch(/lead 7 · safety blank · review 7/);
    expect(partial.impactBridge).toMatch(/Complete the blank day/i);

    const complete: MerchantPlanningInputs = {
      leadTimeDays: 7,
      safetyStockDays: 5,
      reviewPeriodDays: 7,
    };
    const done = buildReplenishmentImpactPresentation(complete);
    expect(done.configurationKind).toBe("complete");
    expect(done.impactBridge).toMatch(/lead 7 · safety 5 · review 7/);
    expect(done.impactBridge).toMatch(/not purchase quantities/i);
    expect(done.fieldExplainers).toHaveLength(3);
    expect(done.fieldExplainers[0]?.drives).toMatch(/reorder point/i);
    expect(done.fieldExplainers[1]?.drives).toMatch(/safety stock/i);
    expect(done.fieldExplainers[2]?.drives).toMatch(/target stock/i);
  });

  it("preserves known-zero day labels and cleared unknown summary", () => {
    const zeroInputs: MerchantPlanningInputs = {
      leadTimeDays: 0,
      safetyStockDays: 0,
      reviewPeriodDays: 0,
    };
    const zero = buildReplenishmentImpactPresentation(zeroInputs);
    expect(zero.configurationKind).toBe("complete");
    expect(zero.fieldExplainers[0]?.persistedLabel).toMatch(/known zero/i);
    expect(formatPlanningAssumptionsForInspector(zeroInputs)).toMatch(
      /lead 0 · safety 0 · review 0/,
    );
    expect(formatPlanningAssumptionsForInspector(null)).toBeNull();
    expect(
      formatPlanningAssumptionsForInspector({
        leadTimeDays: null,
        safetyStockDays: null,
        reviewPeriodDays: null,
      }),
    ).toMatch(/No replenishment assumptions saved/i);
  });

  it("formats SKU thresholds as planning thresholds with stale metric dates", () => {
    const fresh = formatCalculatedThresholdsValue({
      safetyStock: 2,
      reorderPoint: 5,
      targetStock: 12,
      metricDate: "2026-11-20",
      historical: false,
    });
    expect(fresh).toMatch(/Safety stock 2 · Reorder point 5 · Target stock 12/);
    expect(fresh).toMatch(/metric 2026-11-20/);
    expect(fresh).not.toMatch(/not buy quantities/i);
    expect(fresh).not.toMatch(/\bSS\b/);
    expect(fresh).not.toMatch(/\bROP\b/);

    const stale = formatCalculatedThresholdsValue({
      safetyStock: 2,
      reorderPoint: 5,
      targetStock: 12,
      metricDate: "2026-11-18",
      historical: true,
    });
    expect(stale).toMatch(/historical while cover is not current/);
    expect(stale).toMatch(/metric 2026-11-18/);

    expect(
      formatCalculatedThresholdsValue({
        safetyStock: null,
        reorderPoint: null,
        targetStock: null,
        metricDate: null,
        historical: false,
      }),
    ).toBeNull();
  });

  it("wires planning assumptions into SKU evidence without inventing buy qty", () => {
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
      {
        stockObservationsStale: true,
        planning: {
          leadTimeDays: 7,
          safetyStockDays: 5,
          reviewPeriodDays: 7,
        },
      },
    );

    expect(evidence.planningAssumptionsLine).toMatch(
      /Assumptions in use: lead 7 · safety 5 · review 7/,
    );
    expect(evidence.facts.find((f) => f.id === "thresholds")?.label).toMatch(
      /Historical calculated thresholds/,
    );
    expect(evidence.facts.find((f) => f.id === "thresholds")?.value).toMatch(
      /Safety stock 2 · Reorder point 5 · Target stock 12/,
    );
    expect(evidence.facts.find((f) => f.id === "thresholds")?.value).toMatch(
      /historical while cover is not current/,
    );
    expect(evidence.lines.join(" ")).not.toMatch(/recommendedOrderQuantity/i);
    expect(evidence.lines.join(" ")).not.toMatch(/\bROQ\b/);
  });
});

describe("UX-INV-1c incoming evidence presentation", () => {
  it("keeps unknown distinct from verified zero and recorded incoming", () => {
    const unknown = presentOrgIncomingEvidence(presence());
    expect(unknown.kind).toBe("unknown");
    expect(unknown.statusLabel).toMatch(/Incoming not confirmed/i);
    expect(unknown.statusDetail).toMatch(/never invented as zero/i);
    expect(unknown.scopeNote).toMatch(/store-level confirmation/i);

    const incomplete = presentOrgIncomingEvidence(
      presence({
        hasPurchaseOrderItemRows: true,
        knownIncomingGrainCount: 0,
      }),
    );
    expect(incomplete.kind).toBe("incomplete");
    expect(incomplete.statusLabel).toMatch(/incomplete/i);
    expect(incomplete.statusDetail).toMatch(/not confirmed/i);
    expect(incomplete.supporting).toMatch(/not zero/i);

    const verified = presentOrgIncomingEvidence(
      presence({
        evidenceCompleteStoreCount: 1,
        knownIncomingGrainCount: 3,
        knownZeroGrainCount: 3,
      }),
    );
    expect(verified.kind).toBe("verified_zero");
    expect(verified.statusLabel).toMatch(/No incoming expected \(confirmed\)/i);

    const recorded = presentOrgIncomingEvidence(
      presence({
        knownIncomingGrainCount: 2,
        positiveIncomingGrainCount: 2,
      }),
    );
    expect(recorded.kind).toBe("recorded_incoming");
    expect(recorded.statusLabel).toMatch(/Incoming recorded/i);
  });

  it("never treats empty attestation as trusted zero", () => {
    const storeUnknown = presentStoreIncomingAttestation({
      storeId: "s1",
      storeName: "snapstore",
      evidenceComplete: false,
      updatedAt: null,
    });
    expect(storeUnknown.kind).toBe("unknown");
    expect(storeUnknown.statusLabel).toMatch(/Store completeness not confirmed/i);
    expect(storeUnknown.toggleLabel).toMatch(
      /Confirm store PO evidence is complete/i,
    );
    expect(storeUnknown.toggleHint).toMatch(/destination-scoped/i);

    const storeComplete = presentStoreIncomingAttestation({
      storeId: "s1",
      storeName: "snapstore",
      evidenceComplete: true,
      updatedAt: "2026-11-20T00:00:00.000Z",
    });
    expect(storeComplete.kind).toBe("confirmed_complete");
    expect(storeComplete.statusDetail).toMatch(/no incoming expected/i);

    expect(incomingAttestationSaveNote(true)).toMatch(/metrics refresh/i);
    expect(incomingAttestationSaveNote(false)).toMatch(
      /stay incoming not confirmed/i,
    );
  });

  it("provides one safe next step per org evidence state", () => {
    for (const kind of [
      presentOrgIncomingEvidence(presence()),
      presentOrgIncomingEvidence(presence({ hasPurchaseOrderItemRows: true })),
      presentOrgIncomingEvidence(
        presence({ knownZeroGrainCount: 1, knownIncomingGrainCount: 1 }),
      ),
      presentOrgIncomingEvidence(
        presence({ positiveIncomingGrainCount: 1, knownIncomingGrainCount: 1 }),
      ),
    ]) {
      expect(kind.nextStep.length).toBeGreaterThan(10);
      expect(kind.nextStep).not.toMatch(
        /approve|buy now|supplier contact|auto-buy|place an order/i,
      );
      expect(kind.commercialFence).toMatch(/unauthorized|never places/i);
    }
  });
});

describe("UX-INV-1c architecture contracts", () => {
  it("wires planning impact + incoming states without commercial unlock", () => {
    const planningEditor = read(
      "components/inventory/planning-inputs-editor.tsx",
    );
    const incomingEditor = read(
      "components/inventory/incoming-evidence-editor.tsx",
    );
    const inspector = read(
      "components/inventory/sku-intelligence-inspector.tsx",
    );
    const page = read("app/(app)/app/[organizationId]/inventory/page.tsx");
    const workspace = read(
      "components/inventory/inventory-intelligence-workspace.tsx",
    );

    const impactHelper = read(
      "lib/planning-inputs/replenishment-impact-presentation.ts",
    );
    expect(planningEditor).toContain("buildReplenishmentImpactPresentation");
    expect(planningEditor).toContain("impact.eyebrow");
    expect(impactHelper).toContain("Your replenishment assumptions");
    expect(planningEditor).toContain("Clear value");
    expect(planningEditor).not.toContain("Clear to unknown");
    expect(planningEditor).toMatch(/blank is never saved as zero/i);
    expect(planningEditor).toContain("data-replenishment-impact");
    expect(planningEditor).toContain("#inventory-evidence");
    expect(impactHelper).toMatch(/not verified supplier or SKU facts/i);
    expect(impactHelper).toMatch(/Commercial recommendations stay unauthorized/i);
    expect(planningEditor).not.toContain("decideInventoryAction");
    expect(planningEditor).not.toContain("recommendedOrderQuantity");

    const incomingHelper = read(
      "lib/incoming-evidence/incoming-evidence-presentation.ts",
    );
    expect(incomingEditor).toContain("presentOrgIncomingEvidence");
    expect(incomingEditor).toContain("presentStoreIncomingAttestation");
    expect(incomingEditor).toContain("storePresentation.toggleLabel");
    expect(incomingHelper).toContain("Confirm store PO evidence is complete");
    expect(incomingHelper).toContain("Incoming not confirmed");
    expect(incomingHelper).toContain("store-level confirmation");
    expect(incomingEditor).toContain("data-incoming-org-kind");
    expect(incomingEditor).toContain("data-incoming-scope-note");
    expect(incomingEditor).toContain("trustedIncoming");
    expect(incomingEditor).not.toContain("decideInventoryAction");
    expect(incomingEditor).not.toMatch(/auto-buy|place order|contact supplier/i);
    expect(incomingHelper).not.toMatch(/auto-buy|place order|contact supplier/i);

    expect(inspector).toContain("planningAssumptionsLine");
    expect(inspector).toContain("data-inspector-planning-assumptions");
    expect(inspector).toContain("#replenishment-settings");
    expect(inspector).toContain("calculatedThresholdsMissingCopy");
    expect(inspector).not.toContain("SS / ROP / target are not available");

    expect(page).toContain("trustedIncoming={readiness.presence.trustedIncoming}");
    expect(page).toContain("planning={{");
    expect(workspace).toContain("planning={planning}");

    expect(planningEditor).toContain("organizationId");
    expect(incomingEditor).toContain("canEdit");
  });

  it("keeps permissions and save semantics on existing actions", () => {
    const planningEditor = read(
      "components/inventory/planning-inputs-editor.tsx",
    );
    const incomingEditor = read(
      "components/inventory/incoming-evidence-editor.tsx",
    );
    const planningActions = read("lib/planning-inputs/actions.ts");
    const incomingActions = read("lib/incoming-evidence/actions.ts");

    expect(planningEditor).toContain("saveMerchantPlanningInputsAction");
    expect(incomingEditor).toContain(
      "saveStoreIncomingEvidenceAttestationAction",
    );
    expect(planningActions).toContain("organization.manage");
    expect(incomingActions).toContain("organization.manage");
    expect(planningActions).toContain("parseMerchantPlanningInputs");
    expect(incomingActions).not.toContain("decideInventoryAction");
    expect(planningActions).not.toContain("commercialActionsEligible");
  });

  it("forbids formula/schema edits in this slice's presentation modules", () => {
    const impact = read(
      "lib/planning-inputs/replenishment-impact-presentation.ts",
    );
    const incoming = read(
      "lib/incoming-evidence/incoming-evidence-presentation.ts",
    );
    expect(impact).not.toContain("recomputeSkuDailyMetric");
    expect(impact).not.toContain("from(\"organization_planning_inputs\")");
    expect(incoming).not.toContain("resolveEligibleIncoming");
    expect(incoming).not.toContain("createSupabase");
  });
});
